const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

type PreRegistrationUiRolloutInput = {
  configuredValue?: string;
  production?: boolean;
};

export function isPreRegistrationUiEnabled(
  input?: PreRegistrationUiRolloutInput
): boolean {
  const hasInjectedValue = Boolean(
    input && Object.prototype.hasOwnProperty.call(input, 'configuredValue')
  );
  const configuredValue = hasInjectedValue
    ? input?.configuredValue
    : import.meta.env.VITE_PRE_REGISTRATION_ENABLED;
  const production = input?.production ?? import.meta.env.PROD;
  const normalized = configuredValue?.trim().toLowerCase();

  if (normalized && ENABLED_VALUES.has(normalized)) return true;
  if (normalized && DISABLED_VALUES.has(normalized)) return false;

  // Keep local/test development compatible while requiring an explicit opt-in
  // in production builds.
  return !production;
}

export const PRE_REGISTRATION_UI_ENABLED = isPreRegistrationUiEnabled();
