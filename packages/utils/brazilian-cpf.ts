export function normalizeBrazilianCpf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function isValidBrazilianCpf(value: unknown): boolean {
  const cpf = normalizeBrazilianCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function normalizeIsoDateOnly(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function isValidIsoDateOnly(value: unknown): boolean {
  return normalizeIsoDateOnly(value) !== '';
}
