import { Prisma, PrismaClient } from '@prisma/client';
import type { CreatePreRegistrationLeadDTO } from '@corrida/types';
import {
  createStudentLeadInTransaction,
  StudentLifecycleError,
} from '../alunos/student-lifecycle.service.js';
import {
  loadStudentIdentity,
  upsertStudentIdentity,
  type StudentIdentityData,
} from '../alunos/student-identity.service.js';
import {
  assertResponsibleProfessorVisible,
} from './pre-registration-enrollment-access.service.js';
import {
  detectPreRegistrationDuplicates,
  PreRegistrationEnrollmentError,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';

const prisma = new PrismaClient();
const DECISION_VALIDITY_DAYS = 30;

export type CreatePreRegistrationLeadWithDecisionDTO = CreatePreRegistrationLeadDTO & {
  confirmedDuplicateReason?: string;
};

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function commercialOf(identity: Record<string, unknown>) {
  const value = identity._leadCommercial;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const commercial = value as Record<string, unknown>;
  return {
    notes: clean(commercial.notes),
    unit: clean(commercial.unit),
  };
}

function identityPatch(
  currentIdentity: Record<string, unknown>,
  input: CreatePreRegistrationLeadWithDecisionDTO
): StudentIdentityData {
  const currentCommercial = commercialOf(currentIdentity);
  return {
    name: input.name,
    phone: input.phone,
    additionalPhone: input.additionalPhone,
    email: input.email,
    additionalEmail: input.additionalEmail,
    cpf: input.cpf,
    _leadCommercial: {
      notes: clean(input.commercialNotes) ?? currentCommercial.notes,
      unit: clean(input.unit) ?? currentCommercial.unit,
    },
  } as unknown as StudentIdentityData;
}

function wrapLifecycleError(error: StudentLifecycleError): PreRegistrationEnrollmentError {
  if (error.code === 'NOT_FOUND') {
    return new PreRegistrationEnrollmentError(error.message, 'NOT_FOUND', error.details);
  }
  if (error.code === 'CONCURRENT_MODIFICATION') {
    return new PreRegistrationEnrollmentError(
      error.message,
      'CONCURRENT_MODIFICATION',
      error.details
    );
  }
  return new PreRegistrationEnrollmentError(error.message, 'PRECONDITION_FAILED', error.details);
}

export const preRegistrationEnrollmentCreateService = {
  async create(
    actor: PreRegistrationEnrollmentActor,
    input: CreatePreRegistrationLeadWithDecisionDTO
  ): Promise<string> {
    const responsibleProfessorId = clean(input.responsibleProfessorId) || actor.professorId;
    const reason = clean(input.confirmedDuplicateReason);

    try {
      return await prisma.$transaction(async (tx) => {
        await assertResponsibleProfessorVisible(actor, responsibleProfessorId, tx);
        const detection = await detectPreRegistrationDuplicates(tx, {
          contractId: actor.contractId,
          overrides: {
            name: input.name,
            cpf: input.cpf,
            phone: input.phone,
            additionalPhone: input.additionalPhone,
            email: input.email,
            additionalEmail: input.additionalEmail,
          },
        });

        if (detection.classification === 'BLOCKING') {
          throw new PreRegistrationEnrollmentError(
            'Existe um cadastro incompatível com os identificadores informados.',
            'BLOCKING_DUPLICATE',
            { fingerprint: detection.fingerprint }
          );
        }
        if (
          detection.classification === 'REVIEW_REQUIRED' &&
          (input.confirmedDuplicateFingerprint !== detection.fingerprint || !reason)
        ) {
          throw new PreRegistrationEnrollmentError(
            'Revise os cadastros semelhantes e informe o motivo antes de criar uma nova pessoa.',
            'DUPLICATE_REVIEW_REQUIRED',
            { fingerprint: detection.fingerprint, reasonRequired: true }
          );
        }

        const lead = await createStudentLeadInTransaction(tx, {
          contractId: actor.contractId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          origin: input.origin,
          createdByProfessorId: actor.professorId,
        });
        await tx.aluno.update({
          where: { id: lead.id },
          data: { professorId: responsibleProfessorId },
        });
        const identity = await loadStudentIdentity(lead.id, actor.contractId, tx);
        await upsertStudentIdentity(
          lead.id,
          actor.contractId,
          identityPatch(identity as unknown as Record<string, unknown>, input),
          {
            client: tx,
            actor: { userId: actor.userId, professorId: actor.professorId },
            sourceType: 'professional',
            sourceReference: 'pre_registration_admin_create',
          }
        );

        if (detection.classification === 'REVIEW_REQUIRED' && reason) {
          await tx.studentLifecycleEvent.create({
            data: {
              alunoId: lead.id,
              contractId: actor.contractId,
              eventType: 'ADMIN_REVIEWED',
              actorUserId: actor.userId,
              actorProfessorId: actor.professorId,
              metadata: {
                kind: 'DEDUPLICATION_DECISION',
                action: 'CONFIRM_DIFFERENT',
                reason,
                fingerprint: detection.fingerprint,
                reviewedRecordVersion: 0,
                validUntil: new Date(
                  Date.now() + DECISION_VALIDITY_DAYS * 86_400_000
                ).toISOString(),
                candidateAlunoIds: detection.candidates.map(
                  (candidate) => candidate.candidateAlunoId
                ),
                decisionPoint: 'LEAD_CREATION',
              },
            },
          });
        }
        return lead.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof PreRegistrationEnrollmentError) throw error;
      if (error instanceof StudentLifecycleError) throw wrapLifecycleError(error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new PreRegistrationEnrollmentError(
            'Já existe uma pessoa com este CPF no contrato.',
            'BLOCKING_DUPLICATE'
          );
        }
        if (error.code === 'P2034') {
          throw new PreRegistrationEnrollmentError(
            'Os cadastros mudaram durante a verificação. Revise e tente novamente.',
            'CONCURRENT_MODIFICATION'
          );
        }
      }
      throw error;
    }
  },
};
