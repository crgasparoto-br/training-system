export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, '($1) $2');
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  }
  return digits.replace(/^(\d{2})(\d{5})(\d+)/, '($1) $2-$3');
}

export function isValidBrazilianPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (digits.length === 11 && digits[2] !== '9') return false;
  return true;
}
