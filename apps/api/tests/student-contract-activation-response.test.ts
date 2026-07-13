import { Prisma, type StudentContract } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { serializeStudentContractActivation } from '../src/modules/student-contracts/student-contract-activation-response.js';

const buildStudentContract = (): StudentContract => ({
  id: 'student-contract-1',
  alunoId: 'aluno-1',
  contractId: 'contract-document-1',
  serviceId: 'service-1',
  status: 'pending_signature',
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: null,
  signedAt: new Date('2026-07-13T12:00:00.000Z'),
  canceledAt: null,
  cancellationReason: null,
  amount: new Prisma.Decimal('350.50'),
  paymentDay: 10,
  notes: 'Renovação anual',
  createdAt: new Date('2026-07-13T10:00:00.000Z'),
  updatedAt: new Date('2026-07-13T12:00:00.000Z'),
});

describe('serializeStudentContractActivation', () => {
  it('serializa o contrato compartilhado sem descartar motivo e data efetiva', () => {
    expect(
      serializeStudentContractActivation({
        studentContract: buildStudentContract(),
        activationDeferred: true,
        reason: 'scheduled_start',
        effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
      })
    ).toEqual({
      studentContract: {
        id: 'student-contract-1',
        alunoId: 'aluno-1',
        contractId: 'contract-document-1',
        serviceId: 'service-1',
        status: 'pending_signature',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: null,
        signedAt: '2026-07-13T12:00:00.000Z',
        canceledAt: null,
        cancellationReason: null,
        amount: 350.5,
        paymentDay: 10,
        notes: 'Renovação anual',
        createdAt: '2026-07-13T10:00:00.000Z',
        updatedAt: '2026-07-13T12:00:00.000Z',
      },
      activationDeferred: true,
      reason: 'scheduled_start',
      effectiveAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('omite effectiveAt enquanto aguarda assinatura', () => {
    const contract = buildStudentContract();
    contract.status = 'draft';
    contract.signedAt = null;

    const result = serializeStudentContractActivation({
      studentContract: contract,
      activationDeferred: true,
      reason: 'awaiting_signature',
    });

    expect(result.reason).toBe('awaiting_signature');
    expect(result).not.toHaveProperty('effectiveAt');
  });
});
