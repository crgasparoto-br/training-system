import type { PrismaClient } from '@prisma/client';
import {
  assertCapacitySourceIntegrity,
  capacitySourceRefsFromBody,
  CapacitySourceIntegrityError,
} from './capacity-prescription-source-integrity.service.js';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    prontuarioGoal: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioPainCase: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioAnamnesisFollowUp: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioMedicationProcedure: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioDiscomfortSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    studentProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    anthropometryAssessment: { findFirst: jest.fn().mockResolvedValue(null) },
    studentAssessmentRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioActivityHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  } as unknown as PrismaClient;
}

const base = {
  contractId: 'contract-136',
  alunoId: 'student-136',
};

describe('capacity prescription source integrity', () => {
  it.each([undefined, null, 'payload', [], {}, { sourceRefs: 'invalid' }])(
    'ignora corpo sem coleção de fontes para o schema final validar: %#',
    (body) => {
      expect(capacitySourceRefsFromBody(body)).toBeNull();
    }
  );

  it('extrai a coleção de fontes de um corpo válido', () => {
    const sourceRefs = [{ type: 'prontuario_goal', id: 'goal-1' }];
    expect(capacitySourceRefsFromBody({ sourceRefs })).toBe(sourceRefs);
  });

  it.each([null, {}, { type: 'adipometry' }, { id: 'source-1' }, { type: 'adipometry', id: '' }])(
    'rejeita referência malformada %#',
    async (candidate) => {
      await expect(
        assertCapacitySourceIntegrity({
          client: clientWith(),
          ...base,
          sourceRefs: [candidate],
        })
      ).rejects.toBeInstanceOf(CapacitySourceIntegrityError);
    }
  );

  it.each([
    'prontuario_goal',
    'prontuario_alert',
    'student_preference',
    'physical_assessment',
    'anthropometry',
    'adipometry',
    'bioimpedance',
    'ultrasound',
    'ventilometry',
    'flexibility_assessment',
    'professor_note',
  ] as const)('rejeita a origem inexistente %s', async (type) => {
    await expect(
      assertCapacitySourceIntegrity({
        client: clientWith(),
        ...base,
        sourceRefs: [
          {
            type,
            id: `missing-${type}`,
            label: 'Metadado enviado pelo cliente',
            origin: 'origem-forjada',
          },
        ],
      })
    ).rejects.toThrow(`Fonte técnica ${type} não encontrada`);
  });

  it('aceita avaliação que pertence ao mesmo aluno e contrato', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'assessment-1' });
    await expect(
      assertCapacitySourceIntegrity({
        client: clientWith({ studentAssessmentRecord: { findFirst } }),
        ...base,
        sourceRefs: [
          {
            type: 'adipometry',
            id: 'assessment-1',
            label: 'Adipometria válida',
          },
        ],
      })
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'assessment-1', contractId: base.contractId, alunoId: base.alunoId },
      select: { id: true },
    });
  });

  it('aceita anotação técnica manual atribuída ao professor autenticado', async () => {
    await expect(
      assertCapacitySourceIntegrity({
        client: clientWith(),
        ...base,
        sourceRefs: [
          {
            type: 'professor_note',
            id: 'manual-note-1',
            label: 'Observação técnica',
            origin: 'Anotação técnica do professor',
          },
        ],
      })
    ).resolves.toBeUndefined();
  });
});
