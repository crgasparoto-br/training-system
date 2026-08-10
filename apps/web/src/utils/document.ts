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

function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += Number(digits[i]) * (length + 1 - i);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export const isValidCpf = (value: string): boolean => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
};
