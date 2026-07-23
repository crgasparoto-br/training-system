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

  it('round-trips a draft through sessionStorage', () => {
    writeDraft({ form: { name: 'Fulano' }, step: 'IDENTIFICATION' });
    expect(readDraft()).toEqual({ form: { name: 'Fulano' }, step: 'IDENTIFICATION' });
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeTruthy();
  });

  it('removes the draft on clearDraft', () => {
    writeDraft({ form: { name: 'Fulano' }, step: 'IDENTIFICATION' });
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
    });

    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('123.456.789-00');
    expect(raw).not.toContain('1990-01-01');
    expect(raw).not.toContain('987.654.321-00');

    const stored = readDraft<FormWithSensitiveFields>();
    expect(stored?.form).toEqual({ name: 'Fulano', guardianName: 'Responsável' });
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
