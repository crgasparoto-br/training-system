import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const clauses = [
  {
    order: 1,
    title: 'Objeto',
    bodyHtml:
      '<p>A CONTRATADA prestará ao(à) CONTRATANTE serviços de treinamento físico personalizado para o(a) aluno(a) <strong>{{aluno.nome}}</strong>, conforme plano <strong>{{servico.nome}}</strong>.</p>',
  },
  {
    order: 2,
    title: 'Valores e pagamento',
    bodyHtml:
      '<p>O valor mensal contratado é de <strong>{{contrato.valorMensal}}</strong> ({{contrato.valorMensalExtenso}}), com vencimento todo dia <strong>{{contrato.diaVencimento}}</strong> de cada mês.</p>',
  },
  {
    order: 3,
    title: 'Horários e frequência',
    bodyHtml:
      '<p>As sessões terão duração de {{servico.duracaoSessao}} e ocorrerão nos horários combinados: <strong>{{contrato.horarios}}</strong>.</p>',
  },
  {
    order: 4,
    title: 'Responsabilidades do aluno',
    bodyHtml:
      '<p>O aluno declara estar apto à prática de atividade física ou compromete-se a apresentar liberação médica quando solicitado, informando alterações de saúde relevantes.</p>',
  },
  {
    order: 5,
    title: 'Vigência, aceite e assinatura',
    bodyHtml:
      '<p>Este contrato inicia em <strong>{{contrato.dataInicio}}</strong> e poderá ser aceito eletronicamente pelo responsável <strong>{{responsavel.nome}}</strong>, CPF <strong>{{responsavel.cpf}}</strong>, preservando-se o hash do documento assinado.</p>',
  },
];

async function main() {
  const contracts = await prisma.companyContract.findMany({ select: { id: true } });

  for (const contract of contracts) {
    const existing = await prisma.contractTemplate.findFirst({
      where: {
        contractId: contract.id,
        name: 'Prestação de Serviço de Treinamento Físico Personalizado',
      },
    });

    if (existing) {
      continue;
    }

    await prisma.contractTemplate.create({
      data: {
        contractId: contract.id,
        name: 'Prestação de Serviço de Treinamento Físico Personalizado',
        description: 'Modelo inicial baseado no contrato da Acesso Saúde e Performance.',
        version: 1,
        status: 'ACTIVE',
        headerHtml:
          '<p><strong>{{empresa.razaoSocial}}</strong> - CNPJ {{empresa.cnpj}} - CREF {{empresa.cref}}</p><p>{{empresa.endereco}}</p>',
        footerHtml:
          '<p>Documento gerado eletronicamente pelo Sistema Acesso em {{contrato.dataAssinatura}}.</p>',
        clauses: {
          create: clauses.map((clause) => ({
            ...clause,
            required: true,
            editable: true,
          })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
