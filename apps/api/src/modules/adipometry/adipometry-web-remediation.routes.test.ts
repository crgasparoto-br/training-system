import {
  adipometryDraftMeasurementsPatchSchema,
  createAdipometryDraftWithResponsibleSchema,
  reassignAdipometryResponsibleSchema,
  updateAdipometryDraftWithClearSchema,
} from './adipometry-web-remediation.routes.js';

describe('contratos web de adipometria', () => {
  it('aceita null apenas como remocao explicita de medida', () => {
    expect(adipometryDraftMeasurementsPatchSchema.parse({ tricepsMm: null })).toEqual({
      tricepsMm: null,
    });
    expect(() => adipometryDraftMeasurementsPatchSchema.parse({ tricepsMm: 0 })).toThrow();
  });

  it('exige responsavel na criacao e preserva o contrato de data', () => {
    expect(createAdipometryDraftWithResponsibleSchema.parse({
      responsibleProfessorId: 'professor-1',
      assessmentDate: '2026-08-04',
    })).toMatchObject({ responsibleProfessorId: 'professor-1' });
    expect(() => createAdipometryDraftWithResponsibleSchema.parse({
      assessmentDate: '2026-08-04',
    })).toThrow();
  });

  it('exige responsavel elegivel e versao observada para recuperar rascunho', () => {
    expect(reassignAdipometryResponsibleSchema.parse({
      responsibleProfessorId: 'professor-2',
      expectedUpdatedAt: '2026-08-05T14:00:00.000Z',
    })).toEqual({
      responsibleProfessorId: 'professor-2',
      expectedUpdatedAt: '2026-08-05T14:00:00.000Z',
    });
    expect(() => reassignAdipometryResponsibleSchema.parse({
      responsibleProfessorId: 'professor-2',
    })).toThrow();
    expect(() => reassignAdipometryResponsibleSchema.parse({
      responsibleProfessorId: 'professor-2',
      expectedUpdatedAt: 'ontem',
    })).toThrow();
  });

  it('aceita patch de rascunho com limpeza sem aceitar campos desconhecidos', () => {
    expect(updateAdipometryDraftWithClearSchema.parse({
      measurements: { thighMm: null },
    })).toEqual({ measurements: { thighMm: null } });
    expect(() => updateAdipometryDraftWithClearSchema.parse({
      measurements: { thighMm: null },
      derivedResult: 10,
    })).toThrow();
  });
});
