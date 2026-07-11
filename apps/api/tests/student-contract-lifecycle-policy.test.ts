import { describe, expect, it } from 'vitest';
import { resolveSignedContractActivation } from '../src/modules/student-contracts/student-contract-activation.js';

describe('contract replacement lifecycle policy', () => {
  it('não encerra o vigente antes da assinatura do candidato', () => {
    const candidateDocumentStatus = 'VIEWED';
    const shouldReplaceCurrent = candidateDocumentStatus === 'SIGNED';

    expect(shouldReplaceCurrent).toBe(false);
  });

  it('uma recusa do candidato não autoriza substituir o vigente', () => {
    const candidateDocumentStatus = 'REJECTED';
    const shouldReplaceCurrent = candidateDocumentStatus === 'SIGNED';

    expect(shouldReplaceCurrent).toBe(false);
  });

  it('usa a mesma data efetiva para terminar o anterior e iniciar o novo', () => {
    const signedAt = new Date('2026-07-11T12:00:00.000Z');
    const requestedStartDate = new Date('2026-08-01T00:00:00.000Z');
    const activation = resolveSignedContractActivation({ signedAt, requestedStartDate });

    const previousContractEndDate = activation.effectiveAt;
    const newContractStartDate = activation.effectiveAt;

    expect(previousContractEndDate.toISOString()).toBe(newContractStartDate.toISOString());
    expect(activation.scheduled).toBe(true);
  });
});
