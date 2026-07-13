export const LEGACY_CONTRACT_REPLACEMENT_CONFIRM_MESSAGE =
  'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.';

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

export const shouldBypassLegacyContractReplacementConfirm = (
  message: unknown,
  replacementConfirmed: boolean
) => replacementConfirmed && message === LEGACY_CONTRACT_REPLACEMENT_CONFIRM_MESSAGE;
