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
  servicoContratado?: string;
  setor?: string;
  item?: string;
  frase?: string;
  productArea: string;
  productMoment?: string;
  linkLabel?: string;
  linkHref?: string;
  order: number;
};

const LEGACY_DEFAULT_MANUAL_ITEMS: ManualSeedItem[] = [
  {
    code: 'AVALIACAO_DICA_PRONTIDAO',
    title: 'Comece pela prontidao do aluno',
    content:
      'Antes de registrar ou interpretar a avaliacao, confirme como o aluno esta se sentindo e se houve dor, fadiga acumulada ou queixa recente.',
    format: 'dica_rapida',
    context: 'avaliacao_fisica',
    servicoContratado: 'Todos',
    setor: 'Todos',
    item: 'Atendimento',
    frase:
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
    servicoContratado: 'Todos',
    setor: 'Todos',
    item: 'Atendimento',
    frase:
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
    servicoContratado: 'Todos',
    setor: 'Todos',
    item: 'Atendimento',
    frase: 'Leve em consideracao as demandas do aluno (nao e frescura dele).',
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
    servicoContratado: 'Todos',
    setor: 'Todos',
    item: 'Atendimento',
    frase:
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
    servicoContratado: 'Todos',
    setor: 'Todos',
    item: 'Atendimento | Sessao',
    frase:
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Planejamento',
    frase: 'Deixar claro os objetivos do periodo.',
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Montagem',
    frase: 'Montar as sessoes de treino com antecedencia (uma semana na frente).',
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Planejamento',
    frase: 'Usar setpoints para justificar as mudancas.',
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Montagem',
    frase:
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Planejamento',
    frase:
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
    servicoContratado: 'Todos',
    setor: 'Todos',
    item: 'Atendimento | Sessao',
    frase:
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal',
    item: 'Ferias e faltas - professor',
    frase:
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
    servicoContratado: 'Personal',
    setor: 'Personal',
    item: 'Ferias e faltas - professor',
    frase:
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Conduta externa',
    frase:
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
    servicoContratado: 'Personal|Consultoria',
    setor: 'Personal|Consultoria',
    item: 'Ferias e faltas | Sessao',
    frase:
      'Envie resumo das caracteristicas importantes do aluno e use o feedback da aula para orientar a proxima decisao.',
    productArea: 'workout_builder_historico',
    productMoment: 'quando houver duvida sobre liberacao',
    linkLabel: 'Abrir cadastro do manual',
    linkHref: '/settings/professor-manual?context=uso_sistema',
    order: 50,
  },
];

const PT_BR_REPLACEMENTS: Array<readonly [RegExp, string]> = [
  [/\bAvaliacao\b/g, 'Avaliação'],
  [/\bavaliacao\b/g, 'avaliação'],
  [/\bfisica\b/g, 'física'],
  [/\bprontidao\b/g, 'prontidão'],
  [/\bNao e\b/g, 'Não é'],
  [/\bnao e\b/g, 'não é'],
  [/\besta\b/g, 'está'],
  [/\bNao\b/g, 'Não'],
  [/\bnao\b/g, 'não'],
  [/\bexpressoes\b/g, 'expressões'],
  [/\binsatisfacao\b/g, 'insatisfação'],
  [/\batencao\b/g, 'atenção'],
  [/\bhistorico\b/g, 'histórico'],
  [/\bhistoricos\b/g, 'históricos'],
  [/\bproximo\b/g, 'próximo'],
  [/\bproxima\b/g, 'próxima'],
  [/\bdecisao\b/g, 'decisão'],
  [/\binterpretacao\b/g, 'interpretação'],
  [/\bconsideracao\b/g, 'consideração'],
  [/\bporque\b/g, 'porquê'],
  [/\breferencia\b/g, 'referência'],
  [/\bpendencias\b/g, 'pendências'],
  [/\bcoerencia\b/g, 'coerência'],
  [/\bsessao\b/g, 'sessão'],
  [/\bSessao\b/g, 'Sessão'],
  [/\bsessoes\b/g, 'sessões'],
  [/\bperiodo\b/g, 'período'],
  [/\bperiodos\b/g, 'períodos'],
  [/\bso\b/g, 'só'],
  [/\bexercicios\b/g, 'exercícios'],
  [/\bexercicio\b/g, 'exercício'],
  [/\blogica\b/g, 'lógica'],
  [/\bcabeca\b/g, 'cabeça'],
  [/\bmudanca\b/g, 'mudança'],
  [/\bmudancas\b/g, 'mudanças'],
  [/\bevolucao\b/g, 'evolução'],
  [/\bprogressao\b/g, 'progressão'],
  [/\balem\b/g, 'além'],
  [/\bduvida\b/g, 'dúvida'],
  [/\bcriterio\b/g, 'critério'],
  [/\bconteudo\b/g, 'conteúdo'],
  [/\breutilizavel\b/g, 'reutilizável'],
  [/\borientacao\b/g, 'orientação'],
  [/\borientacoes\b/g, 'orientações'],
  [/\bcomposicao\b/g, 'composição'],
  [/\bexecucao\b/g, 'execução'],
  [/\bProfilatico\b/g, 'Profilático'],
  [/\bantecedencia\b/g, 'antecedência'],
  [/\bliberacao\b/g, 'liberação'],
  [/\binstrucoes\b/g, 'instruções'],
  [/\bFerias\b/g, 'Férias'],
  [/\bcaracteristicas\b/g, 'características'],
  [/\bpreferencias\b/g, 'preferências'],
  [/\butil\b/g, 'útil'],
  [/\bexplicacao\b/g, 'explicação'],
  [/\bobservacoes\b/g, 'observações'],
  [/\btambem\b/g, 'também'],
  [/\bpossivel\b/g, 'possível'],
  [/\be cabivel\b/g, 'é cabível'],
  [/\bcabivel\b/g, 'cabível'],
  [/\breforcar\b/g, 'reforçar'],
  [/\bapos\b/g, 'após'],
  [/\bsubstituicao\b/g, 'substituição'],
  [/\bbem estar\b/g, 'bem-estar'],
];

function normalizeLegacyManualText(value?: string | null) {
  if (!value) {
    return value ?? undefined;
  }

  return PT_BR_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
}

function toPtBrManualItem(item: ManualSeedItem): ManualSeedItem {
  return {
    ...item,
    title: normalizeLegacyManualText(item.title) ?? item.title,
    content: normalizeLegacyManualText(item.content) ?? item.content,
    servicoContratado: normalizeLegacyManualText(item.servicoContratado),
    setor: normalizeLegacyManualText(item.setor),
    item: normalizeLegacyManualText(item.item),
    frase: normalizeLegacyManualText(item.frase),
    productMoment: normalizeLegacyManualText(item.productMoment),
    linkLabel: normalizeLegacyManualText(item.linkLabel),
  };
}

const DEFAULT_MANUAL_ITEMS = LEGACY_DEFAULT_MANUAL_ITEMS.map(toPtBrManualItem);
const defaultManualItemsByCode = new Map(DEFAULT_MANUAL_ITEMS.map((item) => [item.code, item]));
const legacyManualItemsByCode = new Map(LEGACY_DEFAULT_MANUAL_ITEMS.map((item) => [item.code, item]));
const SYNCABLE_STRING_FIELDS = [
  'title',
  'content',
  'servicoContratado',
  'setor',
  'item',
  'frase',
  'productMoment',
  'linkLabel',
] as const;

type SyncableStringField = (typeof SYNCABLE_STRING_FIELDS)[number];

async function normalizeProfessorManualDefaults(
  tx: Prisma.TransactionClient,
  contractId: string
) {
  const existingItems = await tx.professorManualItem.findMany({
    where: {
      contractId,
      code: { in: DEFAULT_MANUAL_ITEMS.map((item) => item.code) },
    },
  });

  for (const item of existingItems) {
    const nextDefault = defaultManualItemsByCode.get(item.code);
    const legacyDefault = legacyManualItemsByCode.get(item.code);

    if (!nextDefault || !legacyDefault) {
      continue;
    }

    const data: Partial<Record<SyncableStringField | 'order', string | number | null>> = {};

    for (const field of SYNCABLE_STRING_FIELDS) {
      const currentValue = (item[field] ?? null) as string | null;
      const legacyValue = (legacyDefault[field] ?? null) as string | null;
      const nextValue = (nextDefault[field] ?? null) as string | null;

      if (currentValue === legacyValue && currentValue !== nextValue) {
        data[field] = nextValue;
      }
    }

    if (item.order === legacyDefault.order && item.order !== nextDefault.order) {
      data.order = nextDefault.order;
    }

    if (Object.keys(data).length > 0) {
      await tx.professorManualItem.update({
        where: { id: item.id },
        data: data as Prisma.ProfessorManualItemUpdateInput,
      });
    }
  }
}

export async function ensureDefaultProfessorManual(
  tx: Prisma.TransactionClient,
  contractId: string
) {
  const existing = await tx.professorManualItem.count({
    where: { contractId },
  });

  if (existing === 0) {
    await tx.professorManualItem.createMany({
      data: DEFAULT_MANUAL_ITEMS.map((item) => ({
        contractId,
        ...item,
        servicoContratado: item.servicoContratado ?? null,
        setor: item.setor ?? null,
        item: item.item ?? null,
        frase: item.frase ?? null,
        productMoment: item.productMoment ?? null,
        linkLabel: item.linkLabel ?? null,
        linkHref: item.linkHref ?? null,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  await normalizeProfessorManualDefaults(tx, contractId);
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
  servicoContratado?: string | null;
  setor?: string | null;
  item?: string | null;
  frase?: string | null;
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
