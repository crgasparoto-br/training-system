import {
  isActiveAdipometryResponsibleProfessor,
  serializeAdipometryResponsibleProfessor,
  type AdipometryResponsibleProfessorCandidate,
} from './adipometry-responsible-professor.js';

function candidate(
  overrides: Partial<AdipometryResponsibleProfessorCandidate> = {}
): AdipometryResponsibleProfessorCandidate {
  return {
    id: 'professor-1',
    currentStatus: 'active',
    dismissalDate: null,
    user: {
      isActive: true,
      profile: { name: 'Prof. Ana' },
    },
    collaboratorFunction: { isActive: true },
    ...overrides,
  };
}

describe('adipometry responsible professor', () => {
  it('aceita somente professor ativo e vigente', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');

    expect(isActiveAdipometryResponsibleProfessor(candidate(), now)).toBe(true);
    expect(isActiveAdipometryResponsibleProfessor(candidate({ currentStatus: 'INATIVO' }), now)).toBe(false);
    expect(isActiveAdipometryResponsibleProfessor(candidate({
      collaboratorFunction: { isActive: false },
    }), now)).toBe(false);
    expect(isActiveAdipometryResponsibleProfessor(candidate({
      user: { isActive: false, profile: { name: 'Prof. Ana' } },
    }), now)).toBe(false);
    expect(isActiveAdipometryResponsibleProfessor(candidate({
      dismissalDate: new Date('2026-08-04T11:59:59.000Z'),
    }), now)).toBe(false);
    expect(isActiveAdipometryResponsibleProfessor(candidate({
      dismissalDate: new Date('2026-08-05T00:00:00.000Z'),
    }), now)).toBe(true);
  });

  it('não expõe identificador como nome quando o cadastro está incompleto', () => {
    expect(serializeAdipometryResponsibleProfessor(candidate({
      user: { isActive: true, profile: null },
    }))).toEqual({
      id: 'professor-1',
      name: 'Professor sem nome cadastrado',
    });
  });
});
