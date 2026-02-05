export interface AssessmentHistorySection {
  title: string;
  subtitle?: string | null;
  variables: string[];
}

export const assessmentHistorySections: AssessmentHistorySection[] = [
  {
    title: 'Dados Antropométricos',
    variables: [
      'Peso',
      'Estatura',
      'Escapular',
      'Torácica Inspirada',
      'Torácica Expirada',
      'Abdominal',
      'Quadril',
      'Br. Dir. Rel.',
      'Br. Dir. Con.',
      'Coxa Dir.',
      'Perna Dir.',
      'Br. Esq. Rel.',
      'Br. Esq. Con.',
      'Coxa Esq.',
      'Perna Esq.',
    ],
  },
  {
    title: 'Dobras Cutâneas / Composição Corporal',
    variables: [
      'D.C. Tricipital',
      'D.C. Subescapular',
      'D.C. Suprailíaca',
      'D.C. Abdominal',
      'D.C. Coxa',
      'Total de Dobras',
      '% Gordura',
      'Peso',
      'Gordura Absoluta',
      'Massa Magra',
      'Massa Muscular',
      'Nível de Gordura Visceral',
      'Área Muscular do Braço - UMA',
      'IMC',
    ],
  },
  {
    title: 'Composição Corporal Segmentada',
    subtitle: 'Massa Muscular Segmentada',
    variables: [
      'M. Perna Direita',
      'M. Perna Esquerda',
      'M. Braço Direito',
      'M. Braço Esquerdo',
      'M. Tronco',
    ],
  },
  {
    title: 'Composição Corporal Segmentada',
    subtitle: 'Gordura Segmentada',
    variables: [
      'G. Perna Direita',
      'G. Perna Esquerda',
      'G. Braço Direito',
      'G. Braço Esquerdo',
      'G. Tronco',
    ],
  },
  {
    title: 'Ultrassom',
    subtitle: 'Espessura de Tecido Muscular',
    variables: [
      'Anteriores do Braço',
      'Posteriores do Braço',
      'Reto Femoral',
      'Vasto Intermédio',
      'Anteriores da Coxa',
    ],
  },
  {
    title: 'Ultrassom',
    subtitle: 'Espessura de Tecido Adiposo',
    variables: [
      'Abdominal Superficial',
      'Abdominal Profundo',
      'Abdominal Supra Muscular Total',
      'Compartimento Anterior do Braço',
      'Compartimento Posterior do Braço',
      'Compartimento Anterior da Coxa',
    ],
  },
  {
    title: 'Relação Abdome-Quadril',
    variables: [
      'Perímetro Abdominal',
      'Relação Abdome-Quadril',
      'Risco Coronariano Atual',
    ],
  },
  {
    title: 'Índices Neuromusculares',
    variables: [
      'RML Abdominal',
      'R. Abdominal',
      'Flexibilidade',
      'R. Flexibilidade',
    ],
  },
  {
    title: 'Avaliação Metabólica',
    subtitle: 'VO2 e Teste Cardiopulmonar',
    variables: [
      'Protocolo',
      'FC Repouso',
      'VO2máximo',
      'R. VO2máximo',
      'Limiar Anaeróbico (bpm)',
      'Limiar Anaeróbico (km/h ou watt)',
      'Limiar Anaeróbico (pace)',
      'Velocidade Máxima (km/h ou watt)',
      'FC Máxima Predita',
      'FC Máxima no Teste',
    ],
  },
];
