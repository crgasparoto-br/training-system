export type BrazilianDocumentType = 'cpf' | 'cnpj';

const formatCpf = (digits: string) =>
  digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');

const formatCnpj = (digits: string) =>
  digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');

export const formatBrazilianDocument = (
  value: string,
  type?: BrazilianDocumentType
): string => {
  const digits = value.replace(/\D/g, '');
  const resolvedType = type ?? (digits.length > 11 ? 'cnpj' : 'cpf');
  const limited = digits.slice(0, resolvedType === 'cnpj' ? 14 : 11);

  return resolvedType === 'cnpj' ? formatCnpj(limited) : formatCpf(limited);
};
