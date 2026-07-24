import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, DRAFT_STORAGE_KEY, readDraft, writeDraft } from './preRegistrationDraft';

type FormWithSensitiveFields = {
  name?: string;
  cpf?: string;
  birthDate?: string;
  guardianName?: string;
  guardianCpf?: string;
};

describe('preRegistrationDraft', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns null when there is no stored draft', () => {
    expect(readDraft()).toBeNull();
  });

  it('round-trips a versioned draft through sessionStorage', () => {
    writeDraft({ form: { name: 'Fulano' }, step: 'IDENTIFICATION', baseVersion: 4 });
    expect(readDraft()).toEqual({
      form: { name: 'Fulano' },
      step: 'IDENTIFICATION',
      baseVersion: 4,
    });
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeTruthy();
  });

  it('rejects legacy or malformed drafts without a positive baseVersion', () => {
    window.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ form: { name: 'Legado' }, step: 'IDENTIFICATION' })
    );
    expect(readDraft()).toBeNull();

    window.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ form: {}, step: 'IDENTIFICATION', baseVersion: 0 })
    );
    expect(readDraft()).toBeNull();
  });

  it('removes the draft on clearDraft', () => {
    writeDraft({ form: { name: 'Fulano' }, step: 'IDENTIFICATION', baseVersion: 2 });
    clearDraft();
    expect(readDraft()).toBeNull();
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('never persists sensitive fields (cpf, birthDate, guardianCpf) to sessionStorage', () => {
    writeDraft<FormWithSensitiveFields>({
      form: {
        name: 'Fulano',
        cpf: '123.456.789-00',
        birthDate: '1990-01-01',
        guardianName: 'Responsável',
        guardianCpf: '987.654.321-00',
      },
      step: 'IDENTIFICATION',
      baseVersion: 3,
    });

    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('123.456.789-00');
    expect(raw).not.toContain('1990-01-01');
    expect(raw).not.toContain('987.654.321-00');

    const stored = readDraft<FormWithSensitiveFields>();
    expect(stored?.form).toEqual({ name: 'Fulano', guardianName: 'Responsável' });
    expect(stored?.baseVersion).toBe(3);
    expect(stored?.form.cpf).toBeUndefined();
    expect(stored?.form.birthDate).toBeUndefined();
    expect(stored?.form.guardianCpf).toBeUndefined();
  });

  it('degrades gracefully when sessionStorage.getItem throws (e.g. private mode)', () => {
    const original = window.sessionStorage.getItem;
    window.sessionStorage.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readDraft()).toBeNull();
    } finally {
      window.sessionStorage.getItem = original;
    }
  });
});
