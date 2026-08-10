import {
  assertTemplateSupportsParty,
  assertTemplateVariablesCompatible,
  assertUsedContractVariablesFilled,
  extractContractVariableKeys,
} from '../src/modules/contracts/contract-variable-definitions.js';

describe('typed contract template applicability', () => {
  it('keeps existing student templates compatible', () => {
    expect(() => assertTemplateSupportsParty('STUDENT', 'STUDENT')).not.toThrow();
    expect(() => assertTemplateVariablesCompatible('STUDENT', [
      '<p>{{aluno.nome}}</p>',
      '<p>{{empresa.razaoSocial}}</p>',
    ])).not.toThrow();
  });

  it('accepts collaborator variables only for collaborator templates', () => {
    expect(() => assertTemplateVariablesCompatible('COLLABORATOR', [
      '<p>{{colaborador.nome}}</p>',
      '<p>{{colaborador.funcao}}</p>',
      '<p>{{empresa.razaoSocial}}</p>',
    ])).not.toThrow();

    expect(() => assertTemplateVariablesCompatible('STUDENT', [
      '<p>{{colaborador.nome}}</p>',
    ])).toThrow('não é compatível');
  });

  it('allows BOTH templates to use only common variables', () => {
    expect(() => assertTemplateVariablesCompatible('BOTH', [
      '<p>{{empresa.razaoSocial}}</p>',
      '<p>{{contrato.dataAssinatura}}</p>',
    ])).not.toThrow();

    expect(() => assertTemplateVariablesCompatible('BOTH', [
      '<p>{{aluno.nome}}</p>',
    ])).toThrow('só pode usar variáveis comuns');

    expect(() => assertTemplateVariablesCompatible('BOTH', [
      '<p>{{colaborador.nome}}</p>',
    ])).toThrow('só pode usar variáveis comuns');
  });

  it('rejects a template used for the wrong party', () => {
    expect(() => assertTemplateSupportsParty('STUDENT', 'COLLABORATOR'))
      .toThrow('não está disponível para contrato de colaborador');
    expect(() => assertTemplateSupportsParty('COLLABORATOR', 'STUDENT'))
      .toThrow('não está disponível para contrato de aluno');
    expect(() => assertTemplateSupportsParty('BOTH', 'STUDENT')).not.toThrow();
    expect(() => assertTemplateSupportsParty('BOTH', 'COLLABORATOR')).not.toThrow();
  });

  it('rejects unknown variables before preview or generation', () => {
    expect(() => assertTemplateVariablesCompatible('STUDENT', [
      '<p>{{campo.inexistente}}</p>',
    ])).toThrow('Variável de contrato desconhecida');
  });

  it('extracts each token once across header, clauses and footer', () => {
    expect(extractContractVariableKeys([
      '{{empresa.razaoSocial}} {{aluno.nome}}',
      '{{ aluno.nome }}',
      '{{contrato.dataAssinatura}}',
    ])).toEqual([
      'empresa.razaoSocial',
      'aluno.nome',
      'contrato.dataAssinatura',
    ]);
  });

  it('fails when a variable used by the document has no resolved value', () => {
    expect(() => assertUsedContractVariablesFilled(
      ['colaborador.nome', 'empresa.razaoSocial'],
      {
        colaborador: { nome: '' },
        empresa: { razaoSocial: 'ACESSO' },
      }
    )).toThrow('{{colaborador.nome}}');
  });
});
