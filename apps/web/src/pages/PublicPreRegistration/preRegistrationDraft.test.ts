import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllPreRegistrationDrafts,
  clearDraft,
  DRAFT_STORAGE_KEY,
  readDraft,
  writeDraft,
} from './preRegistrationDraft';

type FormWithSensitiveFields = {
  name?: string;
  cpf?: string;
  birthDate?: string;
  guardianName?: string;
  guardianCpf?: string;
};

function authenticate(userId: string) {
  window.localStorage.setItem('user', JSON.stringify({ id: userId }));
}

describe('preRegistrationDraft', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    authenticate('user-a');
  });

  it('returns null when there is no stored draft', () => {
    expect(readDraft('student-1')).toBeNull();
  });

  it('round-trips a versioned draft scoped by user and process', () => {
    writeDraft({ form: { name: 'Fulano' }, step: 'IDENTIFICATION', baseVersion: 4 }, 'student-1');
    expect(readDraft('student-1')).toEqual({
      form: { name: 'Fulano' },
      step: 'IDENTIFICATION',
      baseVersion: 4,
    });
    expect(
      window.sessionStorage.getItem(`${DRAFT_STORAGE_KEY}:user-a:student-1`)
    ).toBeTruthy();
  });

  it('does not expose a draft to another authenticated account', () => {
    writeDraft({ form: { name: 'Responsável anterior' }, step: 'CONTACT', baseVersion: 2 }, 'student-1');

    authenticate('user-b');

    expect(readDraft('student-1')).toBeNull();
    writeDraft({ form: { name: 'Responsável atual' }, step: 'CONTACT', baseVersion: 2 }, 'student-1');
    expect(readDraft('student-1')?.form).toEqual({ name: 'Responsável atual' });

    authenticate('user-a');
    expect(readDraft('student-1')?.form).toEqual({ name: 'Responsável anterior' });
  });

  it('returns null without an authenticated account', () => {
    window.localStorage.removeItem('user');
    writeDraft({ form: { name: 'Não persistir' }, step: 'IDENTIFICATION', baseVersion: 2 }, 'student-1');
    expect(readDraft('student-1')).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('rejects legacy or malformed drafts without a positive baseVersion', () => {
    window.sessionStorage.setItem(
      `${DRAFT_STORAGE_KEY}:user-a:student-1`,
      JSON.stringify({ form: { name: 'Legado' }, step: 'IDENTIFICATION' })
    );
    expect(readDraft('student-1')).toBeNull();

    window.sessionStorage.setItem(
      `${DRAFT_STORAGE_KEY}:user-a:student-1`,
      JSON.stringify({ form: {}, step: 'IDENTIFICATION', baseVersion: 0 })
    );
    expect(readDraft('student-1')).toBeNull();
  });

  it('removes only the current account and process draft on clearDraft', () => {
    writeDraft({ form: { name: 'Aluno 1' }, step: 'IDENTIFICATION', baseVersion: 2 }, 'student-1');
    writeDraft({ form: { name: 'Aluno 2' }, step: 'IDENTIFICATION', baseVersion: 2 }, 'student-2');
    clearDraft('student-1');
    expect(readDraft('student-1')).toBeNull();
    expect(readDraft('student-2')?.form).toEqual({ name: 'Aluno 2' });
  });

  it('clears current and legacy drafts on account transition or logout', () => {
    writeDraft({ form: { name: 'Fulano' }, step: 'IDENTIFICATION', baseVersion: 2 }, 'student-1');
    window.sessionStorage.setItem('pre-registration-draft-v2:student-legacy', '{}');
    window.sessionStorage.setItem('unrelated', 'keep');

    clearAllPreRegistrationDrafts();

    expect(readDraft('student-1')).toBeNull();
    expect(window.sessionStorage.getItem('pre-registration-draft-v2:student-legacy')).toBeNull();
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep');
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
    }, 'student-1');

    const raw = window.sessionStorage.getItem(`${DRAFT_STORAGE_KEY}:user-a:student-1`);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('123.456.789-00');
    expect(raw).not.toContain('1990-01-01');
    expect(raw).not.toContain('987.654.321-00');

    const stored = readDraft<FormWithSensitiveFields>('student-1');
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
      expect(readDraft('student-1')).toBeNull();
    } finally {
      window.sessionStorage.getItem = original;
    }
  });
});
