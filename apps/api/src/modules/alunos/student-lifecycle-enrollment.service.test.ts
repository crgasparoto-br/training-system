import type { Prisma } from '@prisma/client';
import {
  activateStudentEnrollmentInTransaction,
} from './student-lifecycle-enrollment.service.js';

type MockTransaction = {
  aluno: {
    findFirst: jest.Mock;
    count: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  profile: {
    update: jest.Mock;
  };
  studentOnboardingProcess: {
    updateMany: jest.Mock;
  };
  studentLifecycleEvent: {
    create: jest.Mock;
  };
};

function buildTransaction(): MockTransaction {
  return {
    aluno: {
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'aluno-1',
        status: 'ACTIVE_STUDENT',
      }),
    },
    profile: {
      update: jest.fn().mockResolvedValue({ id: 'profile-1' }),
    },
    studentOnboardingProcess: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    studentLifecycleEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

const activationInput = {
  actor: { userId: 'admin-user' },
  metadata: {
    fingerprint: 'review-fingerprint',
    reviewedRecordVersion: 4,
  },
};

describe('activateStudentEnrollmentInTransaction', () => {
  it('projeta o endereço canônico completo no perfil legado durante a ativação', async () => {
    const tx = buildTransaction();
    tx.aluno.findFirst
      .mockResolvedValueOnce({ userId: 'student-user' })
      .mockResolvedValueOnce({
        userId: 'student-user',
        user: {
          profile: {
            name: 'Nome anterior',
          },
        },
      })
      .mockResolvedValueOnce({
        studentProfile: {
          identificationData: {
            name: 'Mariana Silva',
            phone: '(11) 99999-8888',
            email: 'mariana@example.com',
            cpf: '529.982.247-25',
            birthDate: '1995-04-03T00:00:00.000Z',
            addressStreet: 'Rua das Flores',
            addressNumber: '123',
            addressComplement: 'Apto 45',
            addressNeighborhood: 'Centro',
            addressCity: 'São Paulo',
            addressState: 'SP',
            addressZipCode: '01001-000',
          },
        },
        user: null,
      });
    tx.aluno.count.mockResolvedValue(1);

    await activateStudentEnrollmentInTransaction(
      tx as unknown as Prisma.TransactionClient,
      'aluno-1',
      'contract-1',
      activationInput
    );

    expect(tx.profile.update).toHaveBeenCalledWith({
      where: { userId: 'student-user' },
      data: {
        addressStreet: 'Rua das Flores',
        addressNumber: '123',
        addressComplement: 'Apto 45',
        addressNeighborhood: 'Centro',
        addressCity: 'São Paulo',
        addressState: 'SP',
        addressZipCode: '01001-000',
      },
    });
    expect(tx.aluno.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'aluno-1',
          contractId: 'contract-1',
          status: 'READY_FOR_ENROLLMENT',
        },
        data: expect.objectContaining({ status: 'ACTIVE_STUDENT' }),
      })
    );
    expect(tx.studentLifecycleEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'CONVERTED_TO_ACTIVE_STUDENT',
        metadata: expect.objectContaining({ legacyAddressProjected: true }),
      }),
    });
  });

  it('não projeta endereço tenant-scoped quando a conta pertence a mais de um aluno', async () => {
    const tx = buildTransaction();
    tx.aluno.findFirst
      .mockResolvedValueOnce({ userId: 'shared-user' })
      .mockResolvedValueOnce({
        userId: 'shared-user',
        user: {
          profile: {
            name: 'Perfil compartilhado',
          },
        },
      });
    tx.aluno.count.mockResolvedValue(2);

    await activateStudentEnrollmentInTransaction(
      tx as unknown as Prisma.TransactionClient,
      'aluno-1',
      'contract-1',
      activationInput
    );

    expect(tx.profile.update).not.toHaveBeenCalled();
    expect(tx.aluno.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE_STUDENT' }),
      })
    );
    expect(tx.studentLifecycleEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'CONVERTED_TO_ACTIVE_STUDENT',
        metadata: expect.objectContaining({ legacyAddressProjected: false }),
      }),
    });
  });
});
