import {
  PrismaClient,
  type Prisma,
  type ProfessorManualContext,
  type ProfessorManualFormat,
} from '@prisma/client';

const prisma = new PrismaClient();

type ManualSeedItem = {
  code: string;
  title: string;
  content: string;
  format: ProfessorManualFormat;
  context: ProfessorManualContext;
  audience?: string;
  sourceSection?: string;
  sourceItem?: string;
  sourceExcerpt?: string;
  productArea: string;
  productMoment?: string;
  linkLabel?: string;
  linkHref?: string;
  order: number;
};

const DEFAULT_MANUAL_ITEMS: ManualSeedItem[] = [
  {
    code: 'AVALIACAO_DICA_PRONTIDAO',
    title: 'Comece pela prontidao do aluno',
    content:
      'Antes de registrar ou interpretar a avaliacao, confirme como o aluno esta se sentindo e se houve dor, fadiga acumulada ou queixa recente.',
    format: 'dica_rapida',
    context: 'avaliacao_fisica',
    audience: 'Todos',
    sourceSection: 'Todos',
    sourceItem: 'Atendimento',
    sourceExcerpt:
      'Questione frequentemente sobre como o aluno esta se sentindo (carga, dores na execucao e bem estar geral).',
    productArea: 'aluno_avaliacoes_upload',
    productMoment: 'antes de selecionar o protocolo',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=avaliacao_fisica',
    order: 10,
  },
  {
    code: 'AVALIACAO_ALERTA_QUEIXAS',
    title: 'Queixa nao e detalhe',
    content:
      'Nao ignore expressoes de dor ou insatisfacao. Se algo mudou no atendimento, a avaliacao precisa carregar esse contexto antes de virar referencia do treino.',
    format: 'alerta',
    context: 'avaliacao_fisica',
    audience: 'Todos',
    sourceSection: 'Todos',
    sourceItem: 'Atendimento',
    sourceExcerpt:
      'Demonstre atencao e cuidado com o aluno (Interprete expressoes de dor ou insatisfacao).',
    productArea: 'aluno_avaliacoes_upload',
    productMoment: 'na leitura do historico e da coleta',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=avaliacao_fisica',
    order: 20,
  },
  {
    code: 'AVALIACAO_EXEMPLO_DECISAO',
    title: 'Exemplo de leitura operacional',
    content:
      'Se o aluno relata desconforto e queda de bem-estar, use o registro para explicar o proximo ajuste do plano em vez de tratar a coleta como dado isolado.',
    format: 'exemplo',
    context: 'avaliacao_fisica',
    audience: 'Todos',
    sourceSection: 'Todos',
    sourceItem: 'Atendimento',
    sourceExcerpt: 'Leve em consideracao as demandas do aluno (nao e frescura dele).',
    productArea: 'aluno_avaliacoes_historico',
    productMoment: 'ao relacionar avaliacao e plano',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=avaliacao_fisica',
    order: 30,
  },
  {
    code: 'AVALIACAO_LEMBRETE_EXPLICACAO',
    title: 'Explique o porque para o aluno',
    content:
      'Conscientize o aluno: a avaliacao deve ajudar a explicar os motivos dos elementos da sessao e da decisao de progressao.',
    format: 'lembrete_metodo',
    context: 'avaliacao_fisica',
    audience: 'Todos',
    sourceSection: 'Todos',
    sourceItem: 'Atendimento',
    sourceExcerpt:
      'Conscientize seu aluno (explique os motivos dos elementos da sessao de treino).',
    productArea: 'aluno_avaliacoes_upload',
    productMoment: 'depois da interpretacao da coleta',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=avaliacao_fisica',
    order: 40,
  },
  {
    code: 'AVALIACAO_SAIBA_MAIS_ATENDIMENTO',
    title: 'Saiba mais: atendimento e sessao',
    content:
      'Trechos-base do manual: interpretar sinais do aluno, questionar dores e bem-estar, e transformar a coleta em decisao clara para o proximo atendimento.',
    format: 'saiba_mais',
    context: 'avaliacao_fisica',
    audience: 'Todos',
    sourceSection: 'Todos',
    sourceItem: 'Atendimento | Sessao',
    sourceExcerpt:
      'Demonstre atencao, questione frequentemente como o aluno esta se sentindo e aproveite o momento para investigar queixas passadas.',
    productArea: 'aluno_avaliacoes_historico',
    productMoment: 'quando houver duvida sobre criterio',
    linkLabel: 'Abrir cadastro do manual',
    linkHref: '/settings/professor-manual?context=avaliacao_fisica',
    order: 50,
  },
  {
    code: 'MONTAGEM_DICA_OBJETIVO_PERIODO',
    title: 'Objetivo do periodo primeiro',
    content:
      'Ao montar a semana, deixe claro o objetivo do periodo antes de preencher sessoes e exercicios. O treino precisa responder ao bloco, nao so ocupar a grade.',
    format: 'dica_rapida',
    context: 'montagem_treino',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Planejamento',
    sourceExcerpt: 'Deixar claro os objetivos do periodo.',
    productArea: 'workout_builder_planejamento',
    productMoment: 'antes de distribuir a semana',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=montagem_treino',
    order: 10,
  },
  {
    code: 'MONTAGEM_ALERTA_IMPROVISO',
    title: 'Evite montar no improviso',
    content:
      'As sessoes devem ser preparadas com antecedencia. Se a logica da semana so faz sentido na sua cabeca, o sistema ainda nao esta claro o bastante.',
    format: 'alerta',
    context: 'montagem_treino',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Montagem',
    sourceExcerpt: 'Montar as sessoes de treino com antecedencia (uma semana na frente).',
    productArea: 'workout_builder_planejamento',
    productMoment: 'antes de salvar ou copiar a semana',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=montagem_treino',
    order: 20,
  },
  {
    code: 'MONTAGEM_EXEMPLO_SETPOINTS',
    title: 'Exemplo de justificativa de mudanca',
    content:
      'Ao trocar o foco do periodo, registre a mudanca com base em setpoints e na evolucao observada para que a progressao fique coerente no historico.',
    format: 'exemplo',
    context: 'montagem_treino',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Planejamento',
    sourceExcerpt: 'Usar setpoints para justificar as mudancas.',
    productArea: 'workout_builder_planejamento',
    productMoment: 'ao ajustar objetivo e progressao',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=montagem_treino',
    order: 30,
  },
  {
    code: 'MONTAGEM_LEMBRETE_CAPACIDADES',
    title: 'Monte alem do exercicio principal',
    content:
      'Considere enfoque principal, componente neurossensorial, profilaxia, flexibilidade e outras capacidades relevantes da sessao.',
    format: 'lembrete_metodo',
    context: 'montagem_treino',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Montagem',
    sourceExcerpt:
      'Levar em consideracao Enfoque principal, Neurossensorial, Profilatico, Flexibilidade e outras capacidades relevantes.',
    productArea: 'workout_builder_planejamento',
    productMoment: 'durante a composicao da sessao',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=montagem_treino',
    order: 40,
  },
  {
    code: 'MONTAGEM_SAIBA_MAIS_MACRO',
    title: 'Saiba mais: planejamento do macro',
    content:
      'Trechos-base do manual: apresentar o planejamento do macro, deixar objetivos do periodo claros e sinalizar as mudancas entre blocos.',
    format: 'saiba_mais',
    context: 'montagem_treino',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Planejamento',
    sourceExcerpt:
      'Realizar e apresentar o planejamento do Macro; deixar claro os objetivos do periodo; deixar claro a mudanca dos periodos.',
    productArea: 'workout_builder_planejamento',
    productMoment: 'quando a semana perder coerencia',
    linkLabel: 'Abrir cadastro do manual',
    linkHref: '/settings/professor-manual?context=montagem_treino',
    order: 50,
  },
  {
    code: 'SISTEMA_DICA_HISTORICO',
    title: 'Leia historico antes de decidir',
    content:
      'Use queixas, feedback final e demandas do aluno para interpretar historicos, pendencias e o que precisa aparecer na proxima sessao.',
    format: 'dica_rapida',
    context: 'uso_sistema',
    audience: 'Todos',
    sourceSection: 'Todos',
    sourceItem: 'Atendimento | Sessao',
    sourceExcerpt:
      'Ao final do treino, questione como o aluno esta se sentindo e leve em consideracao as demandas dele.',
    productArea: 'workout_builder_historico',
    productMoment: 'antes de revisar ou copiar a semana',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=uso_sistema',
    order: 10,
  },
  {
    code: 'SISTEMA_ALERTA_LIBERACAO',
    title: 'Nao libere sem contexto',
    content:
      'Antes de liberar o treino, confirme se o sistema deixa claros objetivo, mudanca de periodo e instrucoes suficientes para outro professor continuar o atendimento.',
    format: 'alerta',
    context: 'uso_sistema',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal',
    sourceItem: 'Ferias e faltas - professor',
    sourceExcerpt:
      'Envie a planilha junto com um resumo das caracteristicas importantes do aluno (preferencias, dores, queixas e assuntos de interesse).',
    productArea: 'workout_builder_liberacao',
    productMoment: 'antes de liberar a semana',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=uso_sistema',
    order: 20,
  },
  {
    code: 'SISTEMA_EXEMPLO_SUBSTITUICAO',
    title: 'Exemplo de registro util',
    content:
      'Se houver troca de professor, o resumo precisa mostrar preferencias, dores, queixas e pontos de atencao do aluno sem depender de explicacao verbal.',
    format: 'exemplo',
    context: 'uso_sistema',
    audience: 'Personal',
    sourceSection: 'Personal',
    sourceItem: 'Ferias e faltas - professor',
    sourceExcerpt:
      'Providencie as aulas com antecedencia e reveja a execucao dos exercicios com o professor substituto.',
    productArea: 'workout_builder_historico',
    productMoment: 'ao preencher observacoes e liberacao',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=uso_sistema',
    order: 30,
  },
  {
    code: 'SISTEMA_LEMBRETE_FEEDBACK',
    title: 'Sistema tambem comunica cuidado',
    content:
      'Sempre que fizer sentido, registre ou dispare mensagens que reforcem condutas e recolham feedback para manter o acompanhamento vivo fora da sessao.',
    format: 'lembrete_metodo',
    context: 'uso_sistema',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Conduta externa',
    sourceExcerpt:
      'Sempre que possivel, e cabivel, envie mensagens para reforcar condutas ou receber feedback.',
    productArea: 'workout_builder_liberacao',
    productMoment: 'apos liberar ou concluir a semana',
    linkLabel: 'Ver base no manual',
    linkHref: '/settings/professor-manual?context=uso_sistema',
    order: 40,
  },
  {
    code: 'SISTEMA_SAIBA_MAIS_CONTINUIDADE',
    title: 'Saiba mais: continuidade operacional',
    content:
      'Trechos-base do manual: antecedencia nas aulas, resumo para substituicao e uso de feedback final para manter continuidade entre professores e semanas.',
    format: 'saiba_mais',
    context: 'uso_sistema',
    audience: 'Personal|Consultoria',
    sourceSection: 'Personal|Consultoria',
    sourceItem: 'Ferias e faltas | Sessao',
    sourceExcerpt:
      'Envie resumo das caracteristicas importantes do aluno e use o feedback da aula para orientar a proxima decisao.',
    productArea: 'workout_builder_historico',
    productMoment: 'quando houver duvida sobre liberacao',
    linkLabel: 'Abrir cadastro do manual',
    linkHref: '/settings/professor-manual?context=uso_sistema',
    order: 50,
  },
];

export async function ensureDefaultProfessorManual(
  tx: Prisma.TransactionClient,
  contractId: string
) {
  const existing = await tx.professorManualItem.count({
    where: { contractId },
  });

  if (existing > 0) {
    return;
  }

  await tx.professorManualItem.createMany({
    data: DEFAULT_MANUAL_ITEMS.map((item) => ({
      contractId,
      ...item,
      audience: item.audience ?? null,
      sourceSection: item.sourceSection ?? null,
      sourceItem: item.sourceItem ?? null,
      sourceExcerpt: item.sourceExcerpt ?? null,
      productMoment: item.productMoment ?? null,
      linkLabel: item.linkLabel ?? null,
      linkHref: item.linkHref ?? null,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}

export async function ensureDefaultProfessorManualForContract(contractId: string) {
  await prisma.$transaction(async (tx) => {
    await ensureDefaultProfessorManual(tx, contractId);
  });
}

type ListFilters = {
  context?: ProfessorManualContext;
  format?: ProfessorManualFormat;
  includeInactive?: boolean;
};

type CreateManualItemInput = {
  contractId: string;
  code: string;
  title: string;
  content: string;
  format: ProfessorManualFormat;
  context: ProfessorManualContext;
  audience?: string | null;
  sourceSection?: string | null;
  sourceItem?: string | null;
  sourceExcerpt?: string | null;
  productArea: string;
  productMoment?: string | null;
  linkLabel?: string | null;
  linkHref?: string | null;
  order?: number;
  isActive?: boolean;
};

type UpdateManualItemInput = Partial<Omit<CreateManualItemInput, 'contractId'>>;

export const professorManualService = {
  async listByContract(contractId: string, filters: ListFilters = {}) {
    return prisma.professorManualItem.findMany({
      where: {
        contractId,
        ...(filters.context ? { context: filters.context } : {}),
        ...(filters.format ? { format: filters.format } : {}),
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ context: 'asc' }, { order: 'asc' }, { title: 'asc' }],
    });
  },

  async create(data: CreateManualItemInput) {
    return prisma.professorManualItem.create({
      data: {
        ...data,
        order: data.order ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  },

  async update(id: string, contractId: string, data: UpdateManualItemInput) {
    const existing = await prisma.professorManualItem.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('ITEM_NOT_FOUND');
    }

    return prisma.professorManualItem.update({
      where: { id },
      data,
    });
  },

  async delete(id: string, contractId: string) {
    const existing = await prisma.professorManualItem.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('ITEM_NOT_FOUND');
    }

    return prisma.professorManualItem.delete({
      where: { id },
    });
  },
};
