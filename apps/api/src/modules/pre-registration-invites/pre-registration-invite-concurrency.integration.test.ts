import { PrismaClient } from '@prisma/client';
import { createStudentLead } from '../alunos/student-lifecycle.service.js';
import { preRegistrationInviteService } from './pre-registration-invite.service.js';

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('pre-registration invite administrative concurrency', () => {
  const createdContractIds: string[] = [];

  afterAll(async () => {
    for (const id of [...createdContractIds].reverse()) {
      await prisma.companyContract.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('não confirma revogação quando uma regeneração concorrente substitui o convite', async () => {
    const suffix = unique();
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `invite-concurrency-${suffix}`,
        name: `Contrato concorrência convite ${suffix}`,
      },
    });
    createdContractIds.push(contract.id);

    const lead = await createStudentLead({
      contractId: contract.id,
      name: `Lead concorrência ${suffix}`,
      phone: '11999997777',
      origin: 'test-suite',
    });
    await preRegistrationInviteService.generateFirstInvite(lead.id, contract.id, {});

    const [regeneration, revocation] = await Promise.allSettled([
      preRegistrationInviteService.regenerateInvite(lead.id, contract.id, {}),
      preRegistrationInviteService.revokeInvite(
        lead.id,
        contract.id,
        'Revogação concorrente de teste',
        {}
      ),
    ]);

    if (revocation.status === 'fulfilled') {
      // O comportamento antigo podia resolver como SUPERSEDED e a rota ainda
      // responder "Convite revogado". Sucesso agora significa revogação real.
      expect(revocation.value.status).toBe('REVOKED');
    } else {
      expect(revocation.reason).toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
    }

    if (regeneration.status === 'rejected') {
      expect(regeneration.reason).toMatchObject({
        code: expect.stringMatching(/CONCURRENT_MODIFICATION|NOT_FOUND/),
      });
    }

    const activeInvites = await prisma.preRegistrationInvite.findMany({
      where: { alunoId: lead.id, purpose: 'PRE_REGISTRATION', status: 'ACTIVE' },
    });
    expect(activeInvites.length).toBeLessThanOrEqual(1);

    const revokedEvents = await prisma.preRegistrationInviteEvent.findMany({
      where: { invite: { alunoId: lead.id }, eventType: 'REVOKED' },
    });
    expect(revokedEvents.length).toBeLessThanOrEqual(1);
  });
});
