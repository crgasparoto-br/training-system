import { describe, expect, it } from 'vitest';
import { CONTRACT_VARIABLES } from '../../services/contract.service';
import {
  ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME,
  createAccessPersonalTrainingTemplate,
} from './contractTemplatePresets';

describe('ACESSO personal training contract template', () => {
  it('creates a draft with the seven source clauses in order', () => {
    const template = createAccessPersonalTrainingTemplate();

    expect(template.name).toBe(ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME);
    expect(template.status).toBe('DRAFT');
    expect(template.version).toBe(1);
    expect(template.clauses).toHaveLength(7);
    expect(template.clauses?.map((clause) => clause.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(template.clauses?.map((clause) => clause.title)).toEqual([
      'Do objetivo do contrato',
      'Das características do serviço',
      'Dos valores contratados, formas de pagamento e vigência',
      'Das formas de rescisão contratual',
      'Das normas sobre atrasos, faltas e reposições',
      'Dos períodos de férias, feriados, pontos facultativos e recesso',
      'Disposições gerais',
    ]);
  });

  it('uses only variables supported by the contract module', () => {
    const template = createAccessPersonalTrainingTemplate();
    const html = [
      template.headerHtml,
      template.footerHtml,
      ...(template.clauses || []).map((clause) => clause.bodyHtml),
    ].join('\n');
    const tokens = Array.from(html.matchAll(/{{\s*([^}]+?)\s*}}/g), (match) => match[1]);
    const supportedVariables = new Set(CONTRACT_VARIABLES.map((variable) => variable.key));

    expect(tokens).toContain('professor.nome');
    expect(tokens).toContain('professor.cref');
    expect(tokens.filter((token) => !supportedVariables.has(token))).toEqual([]);
  });

  it('keeps legal review explicit before activation', () => {
    const template = createAccessPersonalTrainingTemplate();

    expect(template.status).not.toBe('ACTIVE');
    expect(template.description).toContain('instrumento particular institucional');
  });
});
