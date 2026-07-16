import { describe, expect, it } from 'vitest';
import { resolveStudentContractPreviewTarget } from './student-contract-preview';

describe('resolveStudentContractPreviewTarget', () => {
  it('monta a prévia de modelo ativo com os dados financeiros atuais', () => {
    expect(
      resolveStudentContractPreviewTarget({
        alunoId: 'student-1',
        selectedContractId: 'template:template-1',
        serviceId: 'service-1',
        professorId: 'professor-1',
        monthlyValue: '1.250,50',
        paymentDay: '10',
        contractStartDate: '2026-07-11',
        notes: 'Segundas e quartas',
      })
    ).toEqual({
      kind: 'template',
      templateId: 'template-1',
      request: {
        templateId: 'template-1',
        alunoId: 'student-1',
        serviceId: 'service-1',
        professorId: 'professor-1',
        valorMensal: 1250.5,
        diaVencimento: 10,
        dataInicio: '2026-07-11',
        horarios: 'Segundas e quartas',
      },
    });
  });

  it('abre a versão persistida quando o contrato já foi gerado', () => {
    expect(
      resolveStudentContractPreviewTarget({
        alunoId: 'student-1',
        selectedContractId: 'generated-contract-1',
      })
    ).toEqual({
      kind: 'generated',
      contractId: 'generated-contract-1',
    });
  });

  it('não cria alvo sem aluno ou contrato selecionado', () => {
    expect(resolveStudentContractPreviewTarget({ alunoId: 'student-1' })).toBeNull();
    expect(resolveStudentContractPreviewTarget({ selectedContractId: 'template:template-1' })).toBeNull();
  });
});
