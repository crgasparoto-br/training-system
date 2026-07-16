jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({})),
}));

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn(),
  },
}));

import { contractDocumentService } from '../src/modules/contracts/contract-document.service';

describe('contractDocumentService', () => {
  it('lista variáveis com metadados e tokens Handlebars', () => {
    const variables = contractDocumentService.listVariables();

    expect(variables).toContainEqual(
      expect.objectContaining({ key: 'aluno.nome', token: '{{aluno.nome}}', groupLabel: 'Aluno' })
    );
    expect(variables).toContainEqual(
      expect.objectContaining({ key: 'professor.nome', token: '{{professor.nome}}', groupLabel: 'Professor' })
    );
    expect(variables).toContainEqual(
      expect.objectContaining({ key: 'servico.resumo', token: '{{servico.resumo}}', groupLabel: 'Serviços' })
    );
    expect(variables).toContainEqual(
      expect.objectContaining({
        key: 'servico.plano.componentes',
        token: '{{servico.plano.componentes}}',
        groupLabel: 'Serviços',
      })
    );
    expect(variables).toContainEqual(
      expect.objectContaining({
        key: 'contrato.valorMensal',
        token: '{{contrato.valorMensal}}',
        groupLabel: 'Contrato',
      })
    );
    expect(variables.every((variable) => variable.description && variable.example)).toBe(true);
  });

  it('renderiza HTML preservando snapshot textual do contrato', () => {
    const html = contractDocumentService.renderTemplate(
      {
        name: 'Contrato teste',
        headerHtml: '<p>{{empresa.razaoSocial}}</p>',
        footerHtml: '<p>{{contrato.dataAssinatura}}</p>',
        clauses: [
          {
            order: 1,
            title: 'Objeto',
            bodyHtml: '<p>Aluno: {{aluno.nome}}</p>',
          },
        ],
      },
      {
        empresa: { razaoSocial: 'Acesso Saúde e Performance' },
        contrato: { dataAssinatura: '01/05/2026' },
        aluno: { nome: 'Maria Silva' },
      }
    );

    expect(html).toContain('Acesso Saúde e Performance');
    expect(html).toContain('Maria Silva');
    expect(html).toContain('01/05/2026');
    expect(html).toContain('<p>Contratante</p>');
  });

  it('não duplica a área de assinaturas quando o modelo fornece uma seção própria', () => {
    const html = contractDocumentService.renderTemplate(
      {
        name: 'Contrato com testemunhas',
        headerHtml: '',
        footerHtml: '<div class="signatures"><p>Assinaturas personalizadas</p></div>',
        clauses: [],
      },
      {}
    );

    expect(html).toContain('Assinaturas personalizadas');
    expect(html).not.toContain('<p>Contratante</p>');
    expect(html.match(/class="signatures"/g)).toHaveLength(1);
  });
});
