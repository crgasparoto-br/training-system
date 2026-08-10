import { describe, expect, it } from 'vitest';
import { isPreRegistrationUiEnabled } from './pre-registration-rollout';

describe('pre-registration UI rollout', () => {
  it('fails closed in production without an explicit value', () => {
    expect(
      isPreRegistrationUiEnabled({ configuredValue: undefined, production: true })
    ).toBe(false);
    expect(
      isPreRegistrationUiEnabled({ configuredValue: 'invalid', production: true })
    ).toBe(false);
  });

  it('keeps local and test builds enabled unless explicitly disabled', () => {
    expect(
      isPreRegistrationUiEnabled({ configuredValue: undefined, production: false })
    ).toBe(true);
    expect(
      isPreRegistrationUiEnabled({ configuredValue: 'false', production: false })
    ).toBe(false);
  });

  it('accepts explicit rollout values in production', () => {
    expect(
      isPreRegistrationUiEnabled({ configuredValue: 'true', production: true })
    ).toBe(true);
    expect(
      isPreRegistrationUiEnabled({ configuredValue: '1', production: true })
    ).toBe(true);
    expect(
      isPreRegistrationUiEnabled({ configuredValue: 'off', production: true })
    ).toBe(false);
  });
});
