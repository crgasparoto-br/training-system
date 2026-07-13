export type SignedContractActivationInput = {
  signedAt: Date;
  requestedStartDate?: Date | null;
};

export type SignedContractActivation = {
  effectiveAt: Date;
  scheduled: boolean;
};

export const resolveSignedContractActivation = ({
  signedAt,
  requestedStartDate,
}: SignedContractActivationInput): SignedContractActivation => {
  const validRequestedStart =
    requestedStartDate && !Number.isNaN(requestedStartDate.getTime())
      ? requestedStartDate
      : null;
  const effectiveAt = validRequestedStart && validRequestedStart > signedAt
    ? validRequestedStart
    : signedAt;

  return {
    effectiveAt,
    scheduled: effectiveAt > signedAt,
  };
};
