import { Prisma, PrismaClient } from '@prisma/client';
import {
  createStudentLeadInTransaction,
  StudentLifecycleError,
} from '../alunos/student-lifecycle.service.js';
import {
  loadStudentIdentity,
  upsertStudentIdentity,
  StudentIdentityLockTimeoutError,
  type StudentIdentityData,
} from '../alunos/student-identity.service.js';
import {
  assertPreRegistrationCreateAccess,
  assertResponsibleProfessorVisible,
  visiblePreRegistrationCandidateIds,
} from './pre-registration-enrollment-access.service.js';
import {
  detectPreRegistrationDuplicates,
  PreRegistrationEnrollmentError,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';
import {
  validateAndNormalizePreRegistrationLeadInput,
  type CreatePreRegistrationLeadWithDecisionDTO,
} from './pre-registration-lead-input.js';

const prisma = new PrismaClient();
const DECISION_VALIDITY_DAYS = 30;

export type { CreatePreRegistrationLeadWithDecisionDTO } from './pre-registration-lead-input.js';

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
  if (error.code === 'MISSING_REQUIRED_FIELDS') {
    return new PreRegistrationEnrollmentError(error.message, 'INVALID_INPUT', error.details);
  }
  return new PreRegistrationEnrollmentError(error.message, 'PRECONDITION_FAILED', error.details);
}

function isSerializationFailure(error: Prisma.PrismaClientKnownRequestError): boolean {
  return (
    error.code === 'P2034' ||
    (error.code === 'P2010' && String(error.meta?.code ?? '') === '40001')
  );
}

export const preRegistrationEnrollmentCreateService = {
  async create(
    actor: PreRegistrationEnrollmentActor,
    rawInput: CreatePreRegistrationLeadWithDecisionDTO
  ): Promise<string> {
    const validation = validateAndNormalizePreRegistrationLeadInput(rawInput);
    if (!validation.success) {
      throw new PreRegistrationEnrollmentError(
        validation.message,
        'INVALID_INPUT',
        { fields: validation.fields }
      );
    }

    const input = validation.data;
    const responsibleProfessorId = clean(input.responsibleProfessorId) || actor.professorId;
    const reason = clean(input.confirmedDuplicateReason);

    try {
      return await prisma.$transaction(async (tx) => {
        // Middleware e preflight são apenas otimizações. A permissão de criação,
        // o tenant e o data scope são reconsultados no mesmo snapshot transacional
        // que executa a deduplicação e a gravação definitiva.
        await assertPreRegistrationCreateAccess(actor, tx);
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
        if (detection.classification === 'REVIEW_REQUIRED') {
          const visibleIds = await visiblePreRegistrationCandidateIds(
            actor,
            detection.candidates.map((candidate) => candidate.candidateAlunoId),
            tx
          );
          if (visibleIds.size !== detection.candidates.length) {
            throw new PreRegistrationEnrollmentError(
              'Esta decisão exige um usuário com escopo para revisar todos os cadastros relacionados.',
              'FORBIDDEN'
            );
          }
          if (input.confirmedDuplicateFingerprint !== detection.fingerprint || !reason) {
            throw new PreRegistrationEnrollmentError(
              'Revise os cadastros semelhantes e informe o motivo antes de criar uma nova pessoa.',
              'DUPLICATE_REVIEW_REQUIRED',
              { fingerprint: detection.fingerprint, reasonRequired: true }
            );
          }
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

        const persistedDetection = await detectPreRegistrationDuplicates(tx, {
          contractId: actor.contractId,
          alunoId: lead.id,
        });
        if (persistedDetection.classification === 'BLOCKING') {
          throw new PreRegistrationEnrollmentError(
            'Existe um cadastro incompatível com os identificadores informados.',
            'BLOCKING_DUPLICATE',
            { fingerprint: persistedDetection.fingerprint }
          );
        }
        if (persistedDetection.classification === 'REVIEW_REQUIRED') {
          const visibleIds = await visiblePreRegistrationCandidateIds(
            actor,
            persistedDetection.candidates.map((candidate) => candidate.candidateAlunoId),
            tx
          );
          if (visibleIds.size !== persistedDetection.candidates.length) {
            throw new PreRegistrationEnrollmentError(
              'Esta decisão exige um usuário com escopo para revisar todos os cadastros relacionados.',
              'FORBIDDEN'
            );
          }
          if (
            input.confirmedDuplicateFingerprint !== persistedDetection.fingerprint ||
            !reason
          ) {
            throw new PreRegistrationEnrollmentError(
              'Os dados relacionados mudaram. Revise os cadastros semelhantes novamente.',
              'DUPLICATE_REVIEW_REQUIRED',
              { fingerprint: persistedDetection.fingerprint, reasonRequired: true }
            );
          }
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
                fingerprint: persistedDetection.fingerprint,
                reviewedRecordVersion: persistedDetection.recordVersion,
                validUntil: new Date(
                  Date.now() + DECISION_VALIDITY_DAYS * 86_400_000
                ).toISOString(),
                candidateAlunoIds: persistedDetection.candidates.map(
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
      if (error instanceof StudentIdentityLockTimeoutError) {
        throw new PreRegistrationEnrollmentError(error.message, 'CONCURRENT_MODIFICATION');
      }
      if (error instanceof StudentLifecycleError) throw wrapLifecycleError(error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new PreRegistrationEnrollmentError(
            'Já existe uma pessoa com este CPF no contrato.',
            'BLOCKING_DUPLICATE'
          );
        }
        if (isSerializationFailure(error)) {
          throw new PreRegistrationEnrollmentError(
            'Os cadastros ou as permissões mudaram durante a verificação. Revise e tente novamente.',
            'CONCURRENT_MODIFICATION'
          );
        }
      }
      throw error;
    }
  },
};
