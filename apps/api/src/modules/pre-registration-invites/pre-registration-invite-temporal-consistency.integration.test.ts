import { PrismaClient } from '@prisma/client';
import { createStudentLead } from '../alunos/student-lifecycle.service.js';
import { preRegistrationInviteService } from './pre-registration-invite.service.js';

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('pre-registration invite administrative temporal consistency', () => {
  const createdContractIds: string[] = [];

  const createLead = async () => {
    const suffix = unique();
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `invite-time-${suffix}`,
        name: `Contrato tempo convite ${suffix}`,
      },
    });
    createdContractIds.push(contract.id);

    const lead = await createStudentLead({
      contractId: contract.id,
      name: `Lead tempo ${suffix}`,
      phone: '11999995555',
      origin: 'test-suite',
    });

    return { contract, lead };
  };

  afterAll(async () => {
    for (const id of [...createdContractIds].reverse()) {
      await prisma.companyContract.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('usa um único snapshot temporal para status, ações e persistência do resumo', async () => {
    const { contract, lead } = await createLead();
    const invite = await preRegistrationInviteService.generateFirstInvite(
      lead.id,
      contract.id,
      {}
    );
    const snapshot = new Date(Date.now() + 60_000);

    await prisma.preRegistrationInvite.update({
      where: { id: invite.summary.id },
      data: { status: 'ACTIVE', expiresAt: snapshot },
    });

    const summary = await preRegistrationInviteService.getSummary(
      lead.id,
      contract.id,
      undefined,
      snapshot
    );

    expect(summary?.status).toBe('EXPIRED');
    expect(summary?.allowedActions).toEqual({
      canGenerateFirst: true,
      canRegenerate: false,
      canRevoke: false,
    });

    const stored = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });
    expect(stored.status).toBe('EXPIRED');

    const expirationEvents = await prisma.preRegistrationInviteEvent.findMany({
      where: { inviteId: invite.summary.id, eventType: 'EXPIRED_ON_READ' },
    });
    expect(expirationEvents).toHaveLength(1);

    const repeatedSummary = await preRegistrationInviteService.getSummary(
      lead.id,
      contract.id,
      undefined,
      snapshot
    );
    expect(repeatedSummary?.status).toBe('EXPIRED');
    expect(
      await prisma.preRegistrationInviteEvent.count({
        where: { inviteId: invite.summary.id, eventType: 'EXPIRED_ON_READ' },
      })
    ).toBe(1);
  });
});