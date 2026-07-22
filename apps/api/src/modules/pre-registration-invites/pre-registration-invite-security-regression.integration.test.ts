import { PrismaClient } from '@prisma/client';
import { createStudentLead } from '../alunos/student-lifecycle.service.js';
import { preRegistrationInviteService } from './pre-registration-invite.service.js';

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('pre-registration invite security regressions', () => {
  const createdContractIds: string[] = [];

  const createLead = async () => {
    const suffix = unique();
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `invite-security-${suffix}`,
        name: `Contrato segurança convite ${suffix}`,
      },
    });
    createdContractIds.push(contract.id);

    const lead = await createStudentLead({
      contractId: contract.id,
      name: `Lead segurança ${suffix}`,
      phone: '11999996666',
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

  it('não persiste token bruto vindo de User-Agent ou motivo de revogação', async () => {
    const { contract, lead } = await createLead();
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contract.id, {
      userId: 'admin-user',
      professorId: 'admin-professor',
    });

    await preRegistrationInviteService.openPublicInvite(invite.token, {
      ipAddress: '203.0.113.20',
      userAgent: `client ${invite.token} https://app.example/pre-cadastro/${invite.token}`,
    });

    const revoked = await preRegistrationInviteService.revokeInvite(
      lead.id,
      contract.id,
      {
        inviteId: invite.summary.id,
        reason: `Link recebido: https://app.example/pre-cadastro/${invite.token}`,
      },
      { userId: 'admin-user', professorId: 'admin-professor' }
    );

    const storedInvite = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });
    const events = await prisma.preRegistrationInviteEvent.findMany({
      where: { inviteId: invite.summary.id },
    });

    expect(revoked.status).toBe('REVOKED');
    expect(storedInvite.revocationReason).toContain('[REDACTED]');
    expect(JSON.stringify(storedInvite)).not.toContain(invite.token);
    expect(JSON.stringify(events)).not.toContain(invite.token);
  });

  it('repetir revogação da versão antiga não revoga um convite novo', async () => {
    const { contract, lead } = await createLead();
    const first = await preRegistrationInviteService.generateFirstInvite(lead.id, contract.id, {});

    await preRegistrationInviteService.revokeInvite(
      lead.id,
      contract.id,
      { inviteId: first.summary.id, reason: 'Primeira revogação' },
      {}
    );

    const second = await preRegistrationInviteService.generateFirstInvite(lead.id, contract.id, {});
    const repeated = await preRegistrationInviteService.revokeInvite(
      lead.id,
      contract.id,
      { inviteId: first.summary.id, reason: 'Repetição da primeira revogação' },
      {}
    );

    expect(repeated.id).toBe(first.summary.id);
    expect(repeated.status).toBe('REVOKED');

    const secondStored = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: second.summary.id },
    });
    expect(secondStored.status).toBe('ACTIVE');
    await expect(preRegistrationInviteService.openPublicInvite(second.token)).resolves.toMatchObject({
      purpose: 'PRE_REGISTRATION',
    });
  });

  it('registra ator autenticado ao consolidar expiração administrativa', async () => {
    const { contract, lead } = await createLead();
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contract.id, {});

    await prisma.preRegistrationInvite.update({
      where: { id: invite.summary.id },
      data: { expiresAt: new Date(Date.now() - 1_000), status: 'ACTIVE' },
    });

    const summary = await preRegistrationInviteService.getSummary(lead.id, contract.id, {
      userId: 'expiry-admin-user',
      professorId: 'expiry-admin-professor',
    });
    expect(summary?.status).toBe('EXPIRED');

    const expirationEvent = await prisma.preRegistrationInviteEvent.findFirstOrThrow({
      where: { inviteId: invite.summary.id, eventType: 'EXPIRED_ON_READ' },
    });
    expect(expirationEvent.actorUserId).toBe('expiry-admin-user');
    expect(expirationEvent.actorProfessorId).toBe('expiry-admin-professor');
    expect(expirationEvent.actorIsPublic).toBe(false);
    expect(expirationEvent.metadata).toMatchObject({
      source: 'administrative_access',
      actorType: 'authenticated',
    });
  });
});
