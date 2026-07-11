export interface StudentContractPreviewFormValues {
  alunoId?: string;
  selectedContractId?: string;
  serviceId?: string;
  professorId?: string;
  monthlyValue?: string;
  paymentDay?: string;
  contractStartDate?: string;
  notes?: string;
}

export type StudentContractPreviewTarget =
  | {
      kind: 'template';
      templateId: string;
      request: Record<string, unknown>;
    }
  | {
      kind: 'generated';
      contractId: string;
    };

const TEMPLATE_REFERENCE_PREFIX = 'template:';

const parseCurrency = (value?: string) => {
  const normalized = (value || '').replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parsePaymentDay = (value?: string) => {
  const parsed = Number((value || '').trim());
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : undefined;
};

export function resolveStudentContractPreviewTarget(
  values: StudentContractPreviewFormValues
): StudentContractPreviewTarget | null {
  const alunoId = values.alunoId?.trim();
  const selectedContractId = values.selectedContractId?.trim();

  if (!alunoId || !selectedContractId) {
    return null;
  }

  if (!selectedContractId.startsWith(TEMPLATE_REFERENCE_PREFIX)) {
    return {
      kind: 'generated',
      contractId: selectedContractId,
    };
  }

  const templateId = selectedContractId.slice(TEMPLATE_REFERENCE_PREFIX.length).trim();
  if (!templateId) {
    return null;
  }

  return {
    kind: 'template',
    templateId,
    request: {
      templateId,
      alunoId,
      ...(values.serviceId ? { serviceId: values.serviceId } : {}),
      ...(values.professorId ? { professorId: values.professorId } : {}),
      ...(parseCurrency(values.monthlyValue) !== undefined
        ? { valorMensal: parseCurrency(values.monthlyValue) }
        : {}),
      ...(parsePaymentDay(values.paymentDay) !== undefined
        ? { diaVencimento: parsePaymentDay(values.paymentDay) }
        : {}),
      ...(values.contractStartDate ? { dataInicio: values.contractStartDate } : {}),
      ...(values.notes ? { horarios: values.notes } : {}),
    },
  };
}
