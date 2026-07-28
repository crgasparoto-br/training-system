import {
  PreRegistrationEnrollmentError,
  preRegistrationEnrollmentService,
} from './pre-registration-enrollment.service.js';
import {
  hasOwnedHealthDataForConsolidation,
  isClinicalReassociationDatabaseError,
} from './pre-registration-clinical-ownership.service.js';

type RuntimeService = typeof preRegistrationEnrollmentService & {
  __issue274ClinicalConsolidationGuardApplied?: boolean;
};

const runtime = preRegistrationEnrollmentService as RuntimeService;

if (!runtime.__issue274ClinicalConsolidationGuardApplied) {
  const decideOriginal = runtime.decide.bind(runtime);

  runtime.decide = async (actor, alunoId, input) => {
    if (input.action !== 'USE_EXISTING_CANONICAL') {
      return decideOriginal(actor, alunoId, input);
    }

    if (await hasOwnedHealthDataForConsolidation(alunoId, actor.contractId)) {
      throw new PreRegistrationEnrollmentError(
        'A consolidação exige reassociação clínica assistida. Nenhum dado foi alterado.',
        'HEALTH_REASSOCIATION_REQUIRED',
        { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' }
      );
    }

    try {
      return await decideOriginal(actor, alunoId, input);
    } catch (error) {
      if (isClinicalReassociationDatabaseError(error)) {
        throw new PreRegistrationEnrollmentError(
          'A consolidação exige reassociação clínica assistida. Nenhum dado foi alterado.',
          'HEALTH_REASSOCIATION_REQUIRED',
          { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' }
        );
      }
      throw error;
    }
  };

  runtime.__issue274ClinicalConsolidationGuardApplied = true;
}
