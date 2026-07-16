export type StudentContractReplacementInput = {
  activeContractId?: string | null;
  selectedContractId?: string | null;
  confirmedForContractId?: string | null;
};

export type StudentContractReplacementView = {
  required: boolean;
  confirmed: boolean;
  canProceed: boolean;
};

export const resolveStudentContractReplacement = ({
  activeContractId,
  selectedContractId,
  confirmedForContractId,
}: StudentContractReplacementInput): StudentContractReplacementView => {
  const normalizedActiveContractId = activeContractId?.trim() || '';
  const normalizedSelectedContractId = selectedContractId?.trim() || '';
  const normalizedConfirmation = confirmedForContractId?.trim() || '';
  const required = Boolean(
    normalizedActiveContractId &&
      normalizedSelectedContractId &&
      normalizedActiveContractId !== normalizedSelectedContractId
  );
  const confirmed = required && normalizedConfirmation === normalizedSelectedContractId;

  return {
    required,
    confirmed,
    canProceed: !required || confirmed,
  };
};
