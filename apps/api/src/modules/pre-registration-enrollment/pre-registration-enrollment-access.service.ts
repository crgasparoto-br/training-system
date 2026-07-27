import { PrismaClient, type Prisma, type Professor } from '@prisma/client';
import type { AccessDataScope } from '@corrida/types';
import {
  buildProfessorDataScopeWhere,
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import {
  PreRegistrationEnrollmentError,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';

const prisma = new PrismaClient();
const SCREEN_KEY = 'students.preRegistration';
const CREATE_BLOCK_KEY = 'students.preRegistration.create';
type DbClient = PrismaClient | Prisma.TransactionClient;

type AccessProfessor = Pick<Professor, 'id' | 'role'> & {
  collaboratorFunction: { id: string; code: string };
};

export type PreRegistrationEnrollmentAccess = {
  scope: AccessDataScope;
  visibleProfessorIds: string[];
};

function isVisible(
  row: { professorId: string | null; createdByProfessorId: string | null },
  access: PreRegistrationEnrollmentAccess
) {
  return (
    access.scope === 'contract' ||
    Boolean(row.professorId && access.visibleProfessorIds.includes(row.professorId)) ||
    Boolean(
      row.createdByProfessorId && access.visibleProfessorIds.includes(row.createdByProfessorId)
    )
  );
}

async function resolveAccess(
  actor: PreRegistrationEnrollmentActor,
  client: DbClient,
  requiredBlockKey?: string
): Promise<PreRegistrationEnrollmentAccess> {
  const professor = await client.professor.findFirst({
    where: { id: actor.professorId, contractId: actor.contractId },
    select: {
      id: true,
      role: true,
      collaboratorFunction: { select: { id: true, code: true } },
    },
  });
  if (!professor?.collaboratorFunction) {
    throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
  }

  const accessProfessor = professor as AccessProfessor;
  const principal = {
    role: accessProfessor.role as 'master' | 'professor',
    collaboratorFunction: accessProfessor.collaboratorFunction,
  };
  const [scope, blockGranted] = await Promise.all([
    getEffectiveDataScopeForProfessor(principal, SCREEN_KEY, client),
    requiredBlockKey
      ? canProfessorAccessBlock(principal, requiredBlockKey, client)
      : Promise.resolve(true),
  ]);
  if (!scope || !blockGranted) {
    throw new PreRegistrationEnrollmentError(
      requiredBlockKey
        ? 'Sem permissão para criar pré-matrículas.'
        : 'Perfil sem escopo para pré-matrículas.',
      'FORBIDDEN'
    );
  }

  const visible = await client.professor.findMany({
    where: buildProfessorDataScopeWhere(actor.contractId, actor.professorId, scope),
    select: { id: true },
  });
  return { scope, visibleProfessorIds: visible.map((item) => item.id) };
}

async function lockCreateAuthorization(
  actor: PreRegistrationEnrollmentActor,
  tx: Prisma.TransactionClient
): Promise<void> {
  const professors = await tx.$queryRaw<Array<{ collaboratorFunctionId: string }>>`
    SELECT "collaboratorFunctionId"
    FROM "Professor"
    WHERE "id" = ${actor.professorId}
      AND "contractId" = ${actor.contractId}
    FOR SHARE
  `;
  const collaboratorFunctionId = professors[0]?.collaboratorFunctionId;
  if (!collaboratorFunctionId) {
    throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
  }

  const functions = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "CollaboratorFunctionOption"
    WHERE "id" = ${collaboratorFunctionId}
      AND "contractId" = ${actor.contractId}
    FOR SHARE
  `;
  if (!functions[0]) {
    throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
  }

  // O lock define o ponto de linearização da autorização. Uma revogação que já
  // atualizou essas linhas vence e será observada; uma revogação posterior
  // aguarda o commit desta criação, evitando TOCTOU entre a leitura e a escrita.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = ${collaboratorFunctionId}
      AND (
        ("screenKey" = ${SCREEN_KEY} AND "blockKey" = '')
        OR "blockKey" = ${CREATE_BLOCK_KEY}
      )
    FOR SHARE
  `;
}

export async function resolvePreRegistrationEnrollmentAccess(
  actor: PreRegistrationEnrollmentActor,
  client: DbClient = prisma
): Promise<PreRegistrationEnrollmentAccess> {
  return resolveAccess(actor, client);
}

export async function assertPreRegistrationCreateAccess(
  actor: PreRegistrationEnrollmentActor,
  tx: Prisma.TransactionClient
): Promise<PreRegistrationEnrollmentAccess> {
  await lockCreateAuthorization(actor, tx);
  return resolveAccess(actor, tx, CREATE_BLOCK_KEY);
}

export async function assertPreRegistrationAlunoVisible(
  actor: PreRegistrationEnrollmentActor,
  alunoId: string,
  client: DbClient = prisma
): Promise<void> {
  const access = await resolvePreRegistrationEnrollmentAccess(actor, client);
  const row = await client.aluno.findFirst({
    where: { id: alunoId, contractId: actor.contractId },
    select: { professorId: true, createdByProfessorId: true },
  });
  if (!row || !isVisible(row, access)) {
    throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
  }
}

export async function visiblePreRegistrationCandidateIds(
  actor: PreRegistrationEnrollmentActor,
  candidateIds: string[],
  client: DbClient = prisma
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const access = await resolvePreRegistrationEnrollmentAccess(actor, client);
  const rows = await client.aluno.findMany({
    where: { id: { in: candidateIds }, contractId: actor.contractId },
    select: { id: true, professorId: true, createdByProfessorId: true },
  });
  return new Set(rows.filter((row) => isVisible(row, access)).map((row) => row.id));
}

export async function assertResponsibleProfessorVisible(
  actor: PreRegistrationEnrollmentActor,
  responsibleProfessorId: string,
  client: DbClient = prisma
): Promise<void> {
  const access = await resolvePreRegistrationEnrollmentAccess(actor, client);
  if (!access.visibleProfessorIds.includes(responsibleProfessorId)) {
    throw new PreRegistrationEnrollmentError('Responsável fora do seu escopo.', 'FORBIDDEN');
  }
}
