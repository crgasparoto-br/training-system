const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

export function isPreRegistrationUiEnabled(input?: {
  configuredValue?: string;
  production?: boolean;
}): boolean {
  const configuredValue = input?.configuredValue ?? import.meta.env.VITE_PRE_REGISTRATION_ENABLED;
  const production = input?.production ?? import.meta.env.PROD;
  const normalized = configuredValue?.trim().toLowerCase();

  if (normalized && ENABLED_VALUES.has(normalized)) return true;
  if (normalized && DISABLED_VALUES.has(normalized)) return false;

  // Keep local/test development compatible while requiring an explicit opt-in
  // in production builds.
  return !production;
}

export const PRE_REGISTRATION_UI_ENABLED = isPreRegistrationUiEnabled();
