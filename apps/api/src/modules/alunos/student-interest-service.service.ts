import type { Prisma } from '@prisma/client';
import { assertStudentInterestServiceSelectable } from './aluno.service-selection.js';

/**
 * Resolve um serviço de interesse dentro da mesma transação da operação do aluno.
 *
 * Esta fronteira é compartilhada pelos cadastros administrativos simples e com
 * contrato para impedir que a validação retenha a transação enquanto abre um
 * segundo PrismaClient/pool ou execute bootstrap do catálogo fora da operação.
 */
export async function loadStudentInterestService(
  tx: Prisma.TransactionClient,
  companyContractId: string,
  serviceId: string,
  currentServiceId?: string | null
) {
  const service = await tx.serviceOption.findFirst({
    where: { id: serviceId, contractId: companyContractId },
    select: { id: true, isActive: true, parentServiceId: true },
  });

  if (!service) {
    throw new Error('Serviço selecionado não pertence ao contrato');
  }

  assertStudentInterestServiceSelectable(service, currentServiceId);
  return service;
}
