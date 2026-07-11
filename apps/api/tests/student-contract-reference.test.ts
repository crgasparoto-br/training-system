import { parseActiveContractTemplateReference } from '../src/modules/student-contracts/student-contract-reference.js';

describe('parseActiveContractTemplateReference', () => {
  it('extrai o id de uma referência de modelo ativo', () => {
    expect(parseActiveContractTemplateReference('template:model-1')).toBe('model-1');
  });

  it('ignora ids de contratos já gerados e referências vazias', () => {
    expect(parseActiveContractTemplateReference('generated-contract-1')).toBeNull();
    expect(parseActiveContractTemplateReference('template:   ')).toBeNull();
  });
});
