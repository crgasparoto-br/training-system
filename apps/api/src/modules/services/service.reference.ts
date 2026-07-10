import type { ServiceCategory, ServicePriceType } from '@corrida/types';

export interface ReferenceOption {
  code: string;
  name: string;
  frequency?: string;
  quantity?: number;
  unit?: string;
  priceType: ServicePriceType;
  priceAmount?: number;
  order: number;
}

export interface ReferenceService {
  code: string;
  name: string;
  category: ServiceCategory;
  order: number;
  summary: string;
  whatIs?: string;
  targetAudience?: string;
  presentationItems: string[];
  options: ReferenceOption[];
  componentOptionCodes?: string[];
}

/**
 * Matriz extraída do material "Serviços ACESSO 2026". Conteúdos não presentes
 * de forma explícita no material permanecem ausentes em vez de serem inferidos.
 */
export const ACESSO_2026_CATALOG: ReferenceService[] = [
  {
    code: 'consultas_avaliacao_fisica',
    name: 'Consultas de Avaliação Física',
    category: 'assessment',
    order: 0,
    summary:
      'Avaliação de diversas capacidades físicas para compreensão do estado físico atual, incluindo composição corporal, ventilometria, baropodometria, dinamometria, avaliação postural e funcional.',
    whatIs:
      'Avaliação de diversas capacidades físicas para compreensão do estado físico atual, incluindo composição corporal, ventilometria, baropodometria, dinamometria, avaliação postural e funcional.',
    presentationItems: [
      'Avaliação da composição corporal',
      'Avaliação postural',
      'Avaliação de equilíbrio',
      'Avaliação baropodométrica',
      'Avaliação de força muscular e assimetrias',
      'Dinamometria',
      'Avaliação metabólica, consumo de O2, limiares, zonas de treinamento e ventilometria',
    ],
    options: [
      {
        code: 'consulta_planejamento_estrategico',
        name: 'Consulta de Planejamento Estratégico em Saúde e Bem-estar',
        priceType: 'free',
        order: 0,
      },
      {
        code: 'consultas_avaliacoes_fisicas',
        name: 'Consultas de Avaliações Físicas',
        priceType: 'on_request',
        order: 1,
      },
    ],
  },
  {
    code: 'plano_essencial',
    name: 'Plano Essencial | Personal Trainer',
    category: 'individual_service',
    order: 1,
    summary:
      'A evolução do Personal Trainer: gestão completa do programa de treinamento baseada em evidências científicas, dados fisiológicos, psicológicos e biomecânicos, individualidade e especificidade.',
    whatIs:
      'A ACESSO Saúde e Performance redefine o treinamento personalizado ao integrar rigor científico e prática de alto nível, com tomada de decisão baseada em evidências e acompanhamento conduzido por professores mestres e doutores.',
    targetAudience:
      'Pessoas que valorizam segurança, prescrição baseada em evidências, funcionalidade, autonomia, longevidade, prevenção de lesões, reabilitação, emagrecimento ou desenvolvimento de massa muscular.',
    presentationItems: [
      'Avaliação Física ACESSO PREMIUM periódica, inicial e a cada 4 meses',
      'Avaliação Física de capacidades-alvo sempre que necessário',
      'Gestão individualizada e completa do programa de treinamento',
      'Prescrição de sessões extras de treinamento aeróbio e/ou força sempre que necessário',
      'Consultoria individual com Doutor em Educação Física e Ciências da Saúde',
      'Personal Trainer de 1 a 5 vezes por semana, conforme contratação',
      'Sessões com Personal Trainer e sessões extras no ACESSO LOUNGE',
    ],
    options: [
      { code: 'plano_essencial_1x', name: '1x por semana', frequency: 'Semanal', quantity: 1, unit: 'sessão por semana', priceType: 'fixed', priceAmount: 962, order: 0 },
      { code: 'plano_essencial_2x', name: '2x por semana', frequency: 'Semanal', quantity: 2, unit: 'sessões por semana', priceType: 'fixed', priceAmount: 1322, order: 1 },
      { code: 'plano_essencial_3x', name: '3x por semana', frequency: 'Semanal', quantity: 3, unit: 'sessões por semana', priceType: 'fixed', priceAmount: 1814, order: 2 },
      { code: 'plano_essencial_4x', name: '4x por semana', frequency: 'Semanal', quantity: 4, unit: 'sessões por semana', priceType: 'fixed', priceAmount: 2332, order: 3 },
      { code: 'plano_essencial_5x', name: '5x por semana', frequency: 'Semanal', quantity: 5, unit: 'sessões por semana', priceType: 'fixed', priceAmount: 2850, order: 4 },
    ],
  },
  {
    code: 'acesso_run',
    name: 'Acesso Run',
    category: 'individual_service',
    order: 2,
    summary:
      'Gestão completa do programa de treinamento para corrida de rua baseada em evidências científicas, dados fisiológicos, psicológicos e biomecânicos, individualidade e especificidade.',
    whatIs:
      'Divisão especializada em corrida de rua da ACESSO, com planejamento baseado em evidências, monitoramento, análises biomecânicas e fisiologia aplicada para corredores amadores e profissionais.',
    targetAudience:
      'Corredores iniciantes ou experientes que buscam segurança, evolução de performance, melhor economia de corrida e menor risco de lesão.',
    presentationItems: [
      'Avaliação Física ACESSO PREMIUM periódica, inicial e a cada 6 meses',
      'Avaliação Física em pista',
      'Gestão individualizada e completa do programa de treinamento',
      'Prescrição de sessões aeróbias e de força, indoor e outdoor',
      'Controle avançado das doses e variáveis do treinamento',
      'Suporte para treinamento outdoor',
      'Suporte em eventos esportivos do calendário ACESSO RUN',
      'Central de atendimento on-line para dúvidas e replanejamento',
      'Valores especiais para avaliações avulsas e serviços de parceiros',
    ],
    options: [
      { code: 'acesso_run_mensal', name: 'Acesso Run mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 358, order: 0 },
    ],
  },
  {
    code: 'consultoria_online',
    name: 'Consultoria On-line',
    category: 'individual_service',
    order: 3,
    summary:
      'Acompanhamento remoto personalizado, baseado em evidências científicas, dados fisiológicos, psicológicos e biomecânicos, individualidade e especificidade.',
    whatIs:
      'Acompanhamento remoto personalizado, baseado em evidências científicas, dados fisiológicos, psicológicos e biomecânicos, individualidade e especificidade.',
    presentationItems: [],
    options: [
      { code: 'consultoria_online_mensal', name: 'Consultoria On-line mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 179, order: 0 },
    ],
  },
  {
    code: 'plano_vida_saudavel',
    name: 'Plano Vida Saudável',
    category: 'combined_plan',
    order: 4,
    summary:
      'Combinação de Personal Trainer, Nutricionista e Massoterapia/Quiropraxia para uma vida equilibrada, produtiva e saudável.',
    whatIs:
      'Plano multidisciplinar que integra Personal Trainer duas vezes por semana, duas sessões mensais de massoterapia ou quiropraxia e acompanhamento nutricional.',
    targetAudience:
      'Adultos com rotina de alta demanda que desejam preservar saúde, funcionalidade, energia, produtividade e longevidade.',
    presentationItems: [
      'ACESSO ESSENCIAL 2X, Personal Trainer 2x por semana',
      '2 sessões de massoterapia e/ou quiropraxia por mês',
      'Acompanhamento nutricional',
      'Valores especiais para serviços do ACESSO LOUNGE e parceiros',
    ],
    options: [
      { code: 'plano_vida_saudavel_mensal', name: 'Plano Vida Saudável mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 2262, order: 0 },
    ],
    componentOptionCodes: ['plano_essencial_2x'],
  },
  {
    code: 'plano_performance_saude',
    name: 'Plano Performance e Saúde',
    category: 'combined_plan',
    order: 5,
    summary:
      'Combinação de Personal Trainer, Pilates, acompanhamento médico, Nutricionista e Massoterapia/Quiropraxia para saúde e performance esportiva.',
    whatIs:
      'Plano multidisciplinar com treinamento personalizado, acompanhamento nutricional, recuperação física, Pilates e acompanhamento cardiológico.',
    targetAudience:
      'Adultos com rotinas de alta demanda que buscam saúde preventiva e alto rendimento no trabalho, na vida social e em esportes amadores.',
    presentationItems: [
      'ACESSO ESSENCIAL 2X, Personal Trainer 2x por semana',
      'Acompanhamento com médico cardiologista',
      '1 sessão de Pilates por semana',
      '1 sessão de massoterapia e/ou quiropraxia por mês',
      'Acompanhamento nutricional',
      'Valores especiais para serviços do ACESSO LOUNGE e parceiros',
    ],
    options: [
      { code: 'plano_performance_saude_mensal', name: 'Plano Performance e Saúde mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 2862, order: 0 },
    ],
    componentOptionCodes: ['plano_essencial_2x'],
  },
  {
    code: 'plano_longevidade_saude',
    name: 'Plano Longevidade e Saúde',
    category: 'combined_plan',
    order: 6,
    summary:
      'Combinação de Personal Trainer, Pilates, Nutricionista e Massoterapia/Quiropraxia para uma vida longeva, funcional e autônoma.',
    whatIs:
      'Ecossistema de cuidado integral que integra treinamento personalizado, nutrição, recuperação física e Pilates para preservar vitalidade, integridade articular e autonomia.',
    targetAudience:
      'Adultos experientes que desejam gerir condições crônicas, manter funcionalidade e aproveitar a vida com independência, energia e segurança.',
    presentationItems: [
      'ACESSO ESSENCIAL 2X, Personal Trainer 2x por semana',
      '1 sessão de Pilates por semana',
      '2 sessões de massoterapia e/ou quiropraxia por mês',
      'Acompanhamento nutricional',
      'Valores especiais para serviços do ACESSO LOUNGE e parceiros',
    ],
    options: [
      { code: 'plano_longevidade_saude_mensal', name: 'Plano Longevidade e Saúde mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 2762, order: 0 },
    ],
    componentOptionCodes: ['plano_essencial_2x'],
  },
  {
    code: 'plano_vida_sem_dor',
    name: 'Plano Vida sem Dor',
    category: 'combined_plan',
    order: 7,
    summary:
      'Combinação de Personal Trainer, Pilates, acompanhamento médico, Nutricionista e Massoterapia/Quiropraxia para controle e tratamento de dores crônicas.',
    whatIs:
      'Ecossistema integrado para manejo de dores crônicas, com treinamento personalizado, Pilates, massoterapia ou quiropraxia e acompanhamento médico especializado.',
    targetAudience:
      'Pessoas com dores ou condições crônicas que desejam recuperar autonomia, funcionalidade e prazer em se movimentar com segurança.',
    presentationItems: [
      'ACESSO ESSENCIAL 1X, Personal Trainer 1x por semana',
      'Acompanhamento médico especializado em manejo e tratamento de dores crônicas',
      '2 sessões de Pilates por semana',
      '4 sessões de massoterapia e/ou quiropraxia por mês',
      'Valores especiais para serviços do ACESSO LOUNGE e parceiros',
    ],
    options: [
      { code: 'plano_vida_sem_dor_mensal', name: 'Plano Vida sem Dor mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 2862, order: 0 },
    ],
    componentOptionCodes: ['plano_essencial_1x'],
  },
  {
    code: 'plano_tratamento_obesidade',
    name: 'Plano Tratamento da Obesidade',
    category: 'combined_plan',
    order: 8,
    summary:
      'Combinação de Personal Trainer, Pilates, acompanhamento médico, Nutricionista e Massoterapia/Quiropraxia para o tratamento da obesidade.',
    whatIs:
      'Plano multiprofissional para tratamento da obesidade com treinamento personalizado, endocrinologista, nutricionista, psicólogo, fisioterapeutas e recuperação física.',
    targetAudience:
      'Pessoas que decidiram tratar a obesidade com suporte multiprofissional, buscando restaurar saúde, vitalidade, autonomia e qualidade de vida.',
    presentationItems: [
      'ACESSO ESSENCIAL 3X, Personal Trainer 3x por semana',
      'Acompanhamento com médico endocrinologista',
      'Acompanhamento psicológico',
      'Acompanhamento nutricional',
      '2 sessões de massoterapia e/ou quiropraxia por mês',
      'Valores especiais para serviços do ACESSO LOUNGE e parceiros',
    ],
    options: [
      { code: 'plano_tratamento_obesidade_mensal', name: 'Plano Tratamento da Obesidade mensal', frequency: 'Mensal', priceType: 'fixed', priceAmount: 3513, order: 0 },
    ],
    componentOptionCodes: ['plano_essencial_3x'],
  },
];
