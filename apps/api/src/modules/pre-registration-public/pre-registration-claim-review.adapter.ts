import { preRegistrationClaimReviewService } from './pre-registration-claim-review.service.js';
import { preRegistrationPublicService } from './pre-registration-public.service.js';

type RuntimeService = typeof preRegistrationPublicService & {
  __issue274ClaimReviewAdapterApplied?: boolean;
};

const runtime = preRegistrationPublicService as RuntimeService;
if (!runtime.__issue274ClaimReviewAdapterApplied) {
  const claimOriginal = runtime.claim.bind(runtime);
  const registerAndClaimOriginal = runtime.registerAndClaim.bind(runtime);

  runtime.claim = async (userId, input) => {
    const result = await claimOriginal(userId, input);
    await preRegistrationClaimReviewService.record(userId, result.alunoId);
    return result;
  };

  runtime.registerAndClaim = async (token, input) => {
    const result = await registerAndClaimOriginal(token, input);
    await preRegistrationClaimReviewService.recordByEmail(input.email, result.alunoId);
    return result;
  };

  runtime.__issue274ClaimReviewAdapterApplied = true;
}
