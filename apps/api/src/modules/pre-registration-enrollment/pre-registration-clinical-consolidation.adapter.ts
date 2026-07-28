import {
  PreRegistrationEnrollmentError,
  preRegistrationEnrollmentService,
} from './pre-registration-enrollment.service.js';
import {
  hasBlockingOwnershipForConsolidation,
  isClinicalReassociationDatabaseError,
} from './pre-registration-clinical-ownership.service.js';
import { releaseIssue274PrismaAfterIntegrationOperation } from './issue-274-prisma.js';

type RuntimeService = typeof preRegistrationEnrollmentService & {
  __issue274ClinicalConsolidationGuardApplied?: boolean;
};

const runtime = preRegistrationEnrollmentService as RuntimeService;

function ownershipError() {
  return new PreRegistrationEnrollmentError(
    'A consolidação exige reassociação assistida dos dados pertencentes a este cadastro. Nenhum dado foi alterado.',
    'HEALTH_REASSOCIATION_REQUIRED',
    { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' }
  );
}

if (!runtime.__issue274ClinicalConsolidationGuardApplied) {
  const decideOriginal = runtime.decide.bind(runtime);

  runtime.decide = async (actor, alunoId, input) => {
    if (input.action !== 'USE_EXISTING_CANONICAL') {
      return decideOriginal(actor, alunoId, input);
    }

    let hasBlockingOwnership = false;
    try {
      hasBlockingOwnership = await hasBlockingOwnershipForConsolidation(
        alunoId,
        actor.contractId
      );
    } finally {
      await releaseIssue274PrismaAfterIntegrationOperation();
    }
    if (hasBlockingOwnership) {
      throw ownershipError();
    }

    try {
      return await decideOriginal(actor, alunoId, input);
    } catch (error) {
      if (isClinicalReassociationDatabaseError(error)) {
        throw ownershipError();
      }
      throw error;
    }
  };

  runtime.__issue274ClinicalConsolidationGuardApplied = true;
}
