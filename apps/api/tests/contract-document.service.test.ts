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
  it('lista variáveis com tokens Handlebars', () => {
    const variables = contractDocumentService.listVariables();

    expect(variables).toContainEqual({ key: 'aluno.nome', token: '{{aluno.nome}}' });
    expect(variables).toContainEqual({ key: 'contrato.valorMensal', token: '{{contrato.valorMensal}}' });
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
  });
});
