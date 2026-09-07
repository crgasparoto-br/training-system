export const maritalStatusOptions = [
  { value: '', label: 'Não informado' },
  { value: 'Solteiro(a)', label: 'Solteiro(a)' },
  { value: 'Casado(a)', label: 'Casado(a)' },
  { value: 'União estável', label: 'União estável' },
  { value: 'Divorciado(a)', label: 'Divorciado(a)' },
  { value: 'Separado(a)', label: 'Separado(a)' },
  { value: 'Viúvo(a)', label: 'Viúvo(a)' },
] as const;

export const socialNetworkOptions = [
  { value: '', label: 'Não informado' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'other', label: 'Outra' },
] as const;

export type SocialNetwork = (typeof socialNetworkOptions)[number]['value'];

const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const formatCpf = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

export const formatRg = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 9);
  const firstEight = normalized.slice(0, 8).replace(/\D/g, '');
  const checkDigit = normalized.length > 8 ? normalized.slice(8, 9) : '';
  const compact = `${firstEight}${checkDigit}`;

  if (compact.length <= 2) return compact;
  if (compact.length <= 5) return `${compact.slice(0, 2)}.${compact.slice(2)}`;
  if (compact.length <= 8) return `${compact.slice(0, 2)}.${compact.slice(2, 5)}.${compact.slice(5)}`;
  return `${compact.slice(0, 2)}.${compact.slice(2, 5)}.${compact.slice(5, 8)}-${compact.slice(8)}`;
};

const maritalStatusAliases: Record<string, string> = {
  solteiro: 'Solteiro(a)',
  'solteiro(a)': 'Solteiro(a)',
  solteira: 'Solteiro(a)',
  casado: 'Casado(a)',
  'casado(a)': 'Casado(a)',
  casada: 'Casado(a)',
  'união estável': 'União estável',
  'uniao estavel': 'União estável',
  divorciado: 'Divorciado(a)',
  'divorciado(a)': 'Divorciado(a)',
  divorciada: 'Divorciado(a)',
  separado: 'Separado(a)',
  'separado(a)': 'Separado(a)',
  separada: 'Separado(a)',
  viuvo: 'Viúvo(a)',
  viúva: 'Viúvo(a)',
  viuva: 'Viúvo(a)',
  'viúvo(a)': 'Viúvo(a)',
};

export const normalizeMaritalStatus = (value?: string | null) => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  return maritalStatusAliases[trimmed.toLocaleLowerCase('pt-BR')] || trimmed;
};

export const normalizeSocialNetwork = (value?: string | null, legacyAccount?: string | null): SocialNetwork => {
  const normalized = value?.trim().toLowerCase();
  const known = socialNetworkOptions.some((option) => option.value === normalized);

  if (known) return normalized as SocialNetwork;
  return legacyAccount?.trim() ? 'instagram' : '';
};

export const socialAccountPlaceholder = (network?: string | null) => {
  switch (network) {
    case 'instagram':
    case 'tiktok':
    case 'x':
      return '@usuario';
    case 'linkedin':
      return 'Nome ou URL do perfil';
    case 'facebook':
    case 'youtube':
      return 'Nome, usuário ou URL do perfil';
    case 'other':
      return 'Conta, usuário ou URL';
    default:
      return 'Selecione primeiro a rede social';
  }
};
