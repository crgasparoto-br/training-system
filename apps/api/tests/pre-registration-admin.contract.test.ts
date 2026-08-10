import {
  ACCESS_BLOCK_CATALOG,
  ACCESS_SCREEN_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
  PRE_REGISTRATION_ADMIN_STATUSES,
} from '@corrida/types';

const actionKeys = [
  'students.preRegistration.create',
  'students.preRegistration.editCommercial',
  'students.preRegistration.generateInvite',
  'students.preRegistration.revokeInvite',
  'students.preRegistration.review',
  'students.preRegistration.discardReopen',
  'students.preRegistration.convert',
] as const;

describe('pre-registration admin access contract', () => {
  it('registers a dedicated screen and exposes active students only through the converted filter', () => {
    expect(ACCESS_SCREEN_CATALOG).toContainEqual({
      key: 'students.preRegistration',
      label: 'Gestão de leads e pré-matrículas',
    });
    expect(PRE_REGISTRATION_ADMIN_STATUSES).toContain('ACTIVE_STUDENT');
  });

  it('registers every granular action under the pre-registration screen', () => {
    for (const key of actionKeys) {
      expect(ACCESS_BLOCK_CATALOG).toContainEqual(
        expect.objectContaining({
          key,
          screenKey: 'students.preRegistration',
        })
      );
    }
  });

  it('limits the professor profile to own operational leads', () => {
    const defaults = DEFAULT_ACCESS_BY_PROFILE_CODE.professor;
    expect(defaults.screens).toContain('students.preRegistration');
    expect(defaults.dataScopes['students.preRegistration']).toBe('self');
    expect(defaults.blocks).toEqual(
      expect.arrayContaining([
        'students.preRegistration.create',
        'students.preRegistration.editCommercial',
        'students.preRegistration.generateInvite',
        'students.preRegistration.revokeInvite',
        'students.preRegistration.discardReopen',
      ])
    );
    expect(defaults.blocks).not.toContain('students.preRegistration.review');
    expect(defaults.blocks).not.toContain('students.preRegistration.convert');
  });

  it.each(['manager', 'administrative'] as const)(
    'gives %s contract-scoped review and conversion actions',
    (profileCode) => {
      const defaults = DEFAULT_ACCESS_BY_PROFILE_CODE[profileCode];
      expect(defaults.dataScopes['students.preRegistration']).toBe('contract');
      expect(defaults.blocks).toEqual(
        expect.arrayContaining([
          'students.preRegistration.review',
          'students.preRegistration.convert',
        ])
      );
    }
  );


  it('keeps conversion as a dedicated action instead of reusing contract permissions', () => {
    expect(actionKeys).toContain('students.preRegistration.convert');
    expect(actionKeys).not.toContain('students.actions.manageFinancialContract' as never);
  });

  it('keeps the intern profile read-only and self-scoped', () => {
    const defaults = DEFAULT_ACCESS_BY_PROFILE_CODE.intern;
    expect(defaults.screens).toContain('students.preRegistration');
    expect(defaults.dataScopes['students.preRegistration']).toBe('self');
    expect(defaults.blocks.some((key) => key.startsWith('students.preRegistration.'))).toBe(false);
  });
});
