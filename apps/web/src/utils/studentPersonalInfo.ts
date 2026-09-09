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

export const emergencyRelationshipOptions = [
  'Mãe',
  'Pai',
  'Cônjuge',
  'Companheiro(a)',
  'Filho(a)',
  'Irmão/Irmã',
  'Avô/Avó',
  'Tio/Tia',
  'Primo(a)',
  'Amigo(a)',
  'Responsável',
  'Outra',
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
  const normalized = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  let digits = '';
  let checkDigit = '';

  for (const character of normalized) {
    if (digits.length < 8) {
      if (/\d/.test(character)) digits += character;
      continue;
    }

    checkDigit = character;
    break;
  }

  const compact = `${digits}${checkDigit}`;

  if (compact.length <= 2) return compact;
  if (compact.length <= 5) return `${compact.slice(0, 2)}.${compact.slice(2)}`;
  if (compact.length <= 8) return `${compact.slice(0, 2)}.${compact.slice(2, 5)}.${compact.slice(5)}`;
  return `${compact.slice(0, 2)}.${compact.slice(2, 5)}.${compact.slice(5, 8)}-${compact.slice(8)}`;
};

export const normalizeMaritalStatus = (value?: string | null) => value ?? '';

export const normalizeSocialNetwork = (value?: string | null, legacyAccount?: string | null): SocialNetwork => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) return legacyAccount?.trim() ? 'instagram' : '';

  const known = socialNetworkOptions.some((option) => option.value === normalized);
  if (known) return normalized as SocialNetwork;
  return legacyAccount?.trim() ? 'instagram' : '';
};

export const socialNetworkLabel = (network?: string | null) =>
  socialNetworkOptions.find((option) => option.value === network)?.label || 'Não informado';

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
