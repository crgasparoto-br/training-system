import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VARIABLES,
  groupContractVariables,
  normalizeContractVariables,
} from './contractVariables';

describe('contractVariables', () => {
  it('organiza as variáveis por domínio em ordem estável', () => {
    const groups = groupContractVariables(CONTRACT_VARIABLES);

    expect(groups.map((group) => group.label)).toEqual([
      'Aluno',
      'Responsável',
      'Empresa',
      'Professor',
      'Serviços',
      'Contrato',
    ]);
    expect(groups.find((group) => group.key === 'servico')?.variables.map((item) => item.key)).toContain(
      'servico.plano.componentes'
    );
  });

  it('mantém descrição e exemplo para todas as variáveis', () => {
    for (const variable of CONTRACT_VARIABLES) {
      expect(variable.token).toBe(`{{${variable.key}}}`);
      expect(variable.label.trim()).not.toBe('');
      expect(variable.description.trim()).not.toBe('');
      expect(variable.example.trim()).not.toBe('');
    }
  });

  it('completa metadados quando a API antiga retorna apenas chave e token', () => {
    const [variable] = normalizeContractVariables([
      { key: 'servico.resumo', token: '{{servico.resumo}}' },
    ]);

    expect(variable.groupLabel).toBe('Serviços');
    expect(variable.label).toBe('Resumo do serviço');
    expect(variable.description).toContain('catálogo comercial');
  });
});
