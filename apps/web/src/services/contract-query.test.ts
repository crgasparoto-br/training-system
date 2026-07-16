import { describe, expect, it } from 'vitest';
import { buildAvailableStudentContractQuery } from './contract-query';

describe('buildAvailableStudentContractQuery', () => {
  it('prioriza o aluno ao editar e ignora o serviço-base incompatível', () => {
    const query = new URLSearchParams(
      buildAvailableStudentContractQuery({
        alunoId: 'aluno-1',
        serviceId: 'servico-base-1',
        onlyUnlinked: false,
        status: ['GENERATED', 'SIGNED'],
      })
    );

    expect(query.get('alunoId')).toBe('aluno-1');
    expect(query.has('serviceId')).toBe(false);
    expect(query.get('onlyUnlinked')).toBe('false');
    expect(query.get('status')).toBe('GENERATED,SIGNED');
  });

  it('mantém o filtro por serviço ao preparar o cadastro de um novo aluno', () => {
    const query = new URLSearchParams(
      buildAvailableStudentContractQuery({
        serviceId: 'oferta-financeira-1',
        onlyUnlinked: true,
      })
    );

    expect(query.has('alunoId')).toBe(false);
    expect(query.get('serviceId')).toBe('oferta-financeira-1');
    expect(query.get('onlyUnlinked')).toBe('true');
  });

  it('não gera parâmetros quando nenhum filtro é informado', () => {
    expect(buildAvailableStudentContractQuery()).toBe('');
  });
});
