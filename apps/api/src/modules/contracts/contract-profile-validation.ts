export type ContractProfileType = 'academy' | 'personal';

export type ContractProfileIdentityValidation =
  | {
      ok: true;
      targetType: ContractProfileType;
      normalizedDocument?: string;
    }
  | {
      ok: false;
      error: string;
    };

export function isContractProfileType(value: unknown): value is ContractProfileType {
  return value === 'academy' || value === 'personal';
}

export function contractProfileDocumentLabel(type: ContractProfileType) {
  return type === 'academy' ? 'CNPJ' : 'CPF';
}

export function validateContractProfileIdentityUpdate(input: {
  currentType: ContractProfileType;
  requestedType?: unknown;
  document?: unknown;
}): ContractProfileIdentityValidation {
  const { currentType, requestedType, document } = input;

  if (requestedType !== undefined && !isContractProfileType(requestedType)) {
    return { ok: false, error: 'Tipo de pessoa inválido' };
  }

  const targetType = requestedType ?? currentType;
  const hasDocument = typeof document === 'string' && document.trim().length > 0;

  if (targetType !== currentType && !hasDocument) {
    return {
      ok: false,
      error: `Informe um ${contractProfileDocumentLabel(targetType)} válido`,
    };
  }

  if (!hasDocument) {
    return { ok: true, targetType };
  }

  const normalizedDocument = (document as string).replace(/\D/g, '');
  const expectedLength = targetType === 'academy' ? 14 : 11;

  if (normalizedDocument.length !== expectedLength) {
    return {
      ok: false,
      error: `${contractProfileDocumentLabel(targetType)} inválido`,
    };
  }

  return {
    ok: true,
    targetType,
    normalizedDocument,
  };
}
