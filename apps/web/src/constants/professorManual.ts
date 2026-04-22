import type {
  ProfessorManualContext,
  ProfessorManualFormat,
} from '../services/professor-manual.service';

export const PROFESSOR_MANUAL_LOCALE = 'pt-BR';

export const professorManualContextLabels: Record<ProfessorManualContext, string> = {
  avaliacao_fisica: 'Avaliação física',
  montagem_treino: 'Montagem de treino',
  uso_sistema: 'Uso do sistema',
};

export const professorManualFormatLabels: Record<ProfessorManualFormat, string> = {
  dica_rapida: 'Dica rápida',
  alerta: 'Alerta',
  exemplo: 'Exemplo',
  lembrete_metodo: 'Lembrete de método',
  saiba_mais: 'Saiba mais',
};
