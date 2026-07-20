export type ContractPartyType = 'STUDENT' | 'COLLABORATOR';
export type ContractTemplateApplicability = ContractPartyType | 'BOTH';

export type ContractVariableGroup =
  | 'aluno'
  | 'responsavel'
  | 'colaborador'
  | 'empresa'
  | 'professor'
  | 'servico'
  | 'contrato';

export type ContractVariableDefinition = {
  key: string;
  token: string;
  group: ContractVariableGroup;
  groupLabel: string;
  label: string;
  description: string;
  example: string;
  applicability: ContractPartyType[];
};

const groupLabels: Record<ContractVariableGroup, string> = {
  aluno: 'Aluno',
  responsavel: 'Responsável',
  colaborador: 'Colaborador',
  empresa: 'Empresa',
  professor: 'Professor',
  servico: 'Serviços',
  contrato: 'Contrato',
};

const STUDENT_ONLY: ContractPartyType[] = ['STUDENT'];
const COLLABORATOR_ONLY: ContractPartyType[] = ['COLLABORATOR'];
const COMMON: ContractPartyType[] = ['STUDENT', 'COLLABORATOR'];

type DefinitionInput = Omit<ContractVariableDefinition, 'token' | 'groupLabel'>;

const definitions: DefinitionInput[] = [
  { key: 'aluno.nome', group: 'aluno', label: 'Nome do aluno', description: 'Nome completo do aluno vinculado ao contrato.', example: 'Mariana Silva', applicability: STUDENT_ONLY },
  { key: 'aluno.cpf', group: 'aluno', label: 'CPF do aluno', description: 'CPF cadastrado no perfil do aluno.', example: '12345678900', applicability: STUDENT_ONLY },
  { key: 'aluno.rg', group: 'aluno', label: 'RG do aluno', description: 'Documento de identidade cadastrado no perfil do aluno.', example: '12.345.678-9', applicability: STUDENT_ONLY },
  { key: 'aluno.enderecoCompleto', group: 'aluno', label: 'Endereço completo do aluno', description: 'Endereço consolidado com logradouro, número, complemento, bairro, cidade, estado e CEP.', example: 'Rua das Flores, 100, Centro, Sorocaba - SP, 18000-000', applicability: STUDENT_ONLY },
  { key: 'responsavel.nome', group: 'responsavel', label: 'Nome do responsável', description: 'Nome do responsável informado na geração. Na ausência, usa o nome do aluno.', example: 'Carlos Silva', applicability: STUDENT_ONLY },
  { key: 'responsavel.cpf', group: 'responsavel', label: 'CPF do responsável', description: 'CPF do responsável informado na geração. Na ausência, usa o CPF do aluno.', example: '98765432100', applicability: STUDENT_ONLY },
  { key: 'responsavel.email', group: 'responsavel', label: 'E-mail do responsável', description: 'E-mail do responsável pelo contrato. Na ausência, usa o e-mail da conta do aluno.', example: 'responsavel@exemplo.com', applicability: STUDENT_ONLY },

  { key: 'colaborador.nome', group: 'colaborador', label: 'Nome do colaborador', description: 'Nome completo do colaborador contratado.', example: 'João Souza', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.cpf', group: 'colaborador', label: 'CPF do colaborador', description: 'CPF cadastrado no perfil do colaborador.', example: '12345678900', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.rg', group: 'colaborador', label: 'RG do colaborador', description: 'Documento de identidade cadastrado no perfil do colaborador.', example: '12.345.678-9', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.enderecoCompleto', group: 'colaborador', label: 'Endereço completo', description: 'Endereço consolidado do colaborador.', example: 'Rua das Flores, 100, Centro, Sorocaba - SP, 18000-000', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.email', group: 'colaborador', label: 'E-mail do colaborador', description: 'E-mail usado para contato e identificação do colaborador.', example: 'joao@exemplo.com', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.telefone', group: 'colaborador', label: 'Telefone do colaborador', description: 'Telefone cadastrado no perfil do colaborador.', example: '(15) 99999-9999', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.funcao', group: 'colaborador', label: 'Função principal', description: 'Função principal atribuída ao colaborador.', example: 'Professor', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.cref', group: 'colaborador', label: 'CREF do colaborador', description: 'Registro profissional do colaborador.', example: '123456-G/SP', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.resumoProfissional', group: 'colaborador', label: 'Resumo profissional', description: 'Resumo profissional cadastrado no perfil.', example: 'Especialista em treinamento de força e corrida.', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.documentoEmpresa', group: 'colaborador', label: 'Documento da empresa', description: 'CNPJ ou documento empresarial informado pelo colaborador.', example: '12.345.678/0001-90', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.gestorResponsavel', group: 'colaborador', label: 'Gestor responsável', description: 'Nome do gestor responsável pelo colaborador.', example: 'Maria Oliveira', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.dataAdmissao', group: 'colaborador', label: 'Data de admissão', description: 'Data de admissão registrada para o colaborador.', example: '15/07/2026', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.dataDesligamento', group: 'colaborador', label: 'Data de desligamento', description: 'Data de desligamento, quando informada.', example: '31/12/2026', applicability: COLLABORATOR_ONLY },
  { key: 'colaborador.situacao', group: 'colaborador', label: 'Situação atual', description: 'Situação administrativa atual do colaborador.', example: 'Ativo', applicability: COLLABORATOR_ONLY },

  { key: 'empresa.razaoSocial', group: 'empresa', label: 'Razão social', description: 'Nome jurídico da empresa ou do prestador responsável pelo contrato.', example: 'ACESSO Saúde e Performance Ltda.', applicability: COMMON },
  { key: 'empresa.cnpj', group: 'empresa', label: 'CNPJ', description: 'CNPJ cadastrado para a empresa responsável pelo contrato.', example: '57636561000107', applicability: COMMON },
  { key: 'empresa.cref', group: 'empresa', label: 'CREF da empresa', description: 'Registro da empresa ou do prestador no Conselho Regional de Educação Física.', example: '000000-G/SP', applicability: COMMON },
  { key: 'empresa.endereco', group: 'empresa', label: 'Endereço da empresa', description: 'Endereço consolidado da empresa ou do prestador responsável.', example: 'Av. Principal, 500, Sorocaba - SP, 18000-000', applicability: COMMON },

  { key: 'professor.nome', group: 'professor', label: 'Nome do professor', description: 'Nome do professor responsável pelo aluno ou informado na geração.', example: 'Prof. João Souza', applicability: STUDENT_ONLY },
  { key: 'professor.cref', group: 'professor', label: 'CREF do professor', description: 'Registro profissional do professor responsável.', example: '123456-G/SP', applicability: STUDENT_ONLY },

  { key: 'servico.nome', group: 'servico', label: 'Nome do serviço', description: 'Nome principal do serviço ou plano vinculado ao contrato.', example: 'Plano Essencial | Personal Trainer', applicability: STUDENT_ONLY },
  { key: 'servico.codigo', group: 'servico', label: 'Código do serviço', description: 'Código estável usado para identificar o serviço no catálogo comercial.', example: 'plano_essencial', applicability: STUDENT_ONLY },
  { key: 'servico.categoria', group: 'servico', label: 'Categoria do serviço', description: 'Categoria comercial formatada do serviço principal.', example: 'Serviço individual', applicability: STUDENT_ONLY },
  { key: 'servico.resumo', group: 'servico', label: 'Resumo do serviço', description: 'Resumo curto exibido no catálogo comercial.', example: 'Gestão completa e individualizada do programa de treinamento.', applicability: STUDENT_ONLY },
  { key: 'servico.oQueE', group: 'servico', label: 'O que é?', description: 'Descrição institucional completa cadastrada na seção “O que é?”.', example: 'Treinamento personalizado com prescrição baseada em evidências.', applicability: STUDENT_ONLY },
  { key: 'servico.publicoAlvo', group: 'servico', label: 'A quem se destina?', description: 'Público-alvo cadastrado para o serviço.', example: 'Pessoas que buscam segurança, autonomia, saúde e performance.', applicability: STUDENT_ONLY },
  { key: 'servico.itensInclusos', group: 'servico', label: 'Itens inclusos', description: 'Lista textual dos itens ativos cadastrados em “O que o compõe?”.', example: 'Avaliação física periódica; gestão do treinamento; consultoria individual', applicability: STUDENT_ONLY },
  { key: 'servico.quantidadeItensInclusos', group: 'servico', label: 'Quantidade de itens inclusos', description: 'Quantidade de itens ativos da apresentação comercial do serviço.', example: '7', applicability: STUDENT_ONLY },
  { key: 'servico.plano.componentes', group: 'servico', label: 'Componentes do plano', description: 'Lista dos serviços e opções ativos vinculados à composição relacional de um plano combinado.', example: 'Personal Trainer — 2x por semana; Pilates · 1 sessão por semana', applicability: STUDENT_ONLY },
  { key: 'servico.valor', group: 'servico', label: 'Valor do serviço', description: 'Valor mensal informado na geração, formatado em reais.', example: 'R$ 1.322,00', applicability: STUDENT_ONLY },
  { key: 'servico.duracaoSessao', group: 'servico', label: 'Duração da sessão', description: 'Variável de compatibilidade do catálogo de serviços.', example: '60 minutos', applicability: STUDENT_ONLY },
  { key: 'servico.quantidadeSemanal', group: 'servico', label: 'Quantidade semanal', description: 'Variável de compatibilidade da opção comercial.', example: '2 sessões por semana', applicability: STUDENT_ONLY },

  { key: 'contrato.valorMensal', group: 'contrato', label: 'Valor mensal', description: 'Valor mensal negociado e informado na geração do contrato.', example: 'R$ 1.322,00', applicability: COMMON },
  { key: 'contrato.valorMensalExtenso', group: 'contrato', label: 'Valor mensal por extenso', description: 'Representação textual do valor mensal do contrato.', example: 'R$ 1.322,00 reais', applicability: COMMON },
  { key: 'contrato.diaVencimento', group: 'contrato', label: 'Dia de vencimento', description: 'Dia do mês definido para vencimento, quando aplicável.', example: '10', applicability: COMMON },
  { key: 'contrato.horarios', group: 'contrato', label: 'Dias e horários', description: 'Dias, horários ou observações de execução informados para o contrato.', example: 'Segundas e quartas-feiras, às 7h', applicability: COMMON },
  { key: 'contrato.dataInicio', group: 'contrato', label: 'Data de início', description: 'Data prevista para início da vigência.', example: '15/07/2026', applicability: COMMON },
  { key: 'contrato.dataAssinatura', group: 'contrato', label: 'Data de assinatura', description: 'Data da assinatura ou geração do documento.', example: '10/07/2026', applicability: COMMON },
];

export const contractVariableDefinitions: ContractVariableDefinition[] = definitions.map((definition) => ({
  ...definition,
  token: `{{${definition.key}}}`,
  groupLabel: groupLabels[definition.group],
}));

export const contractVariables = contractVariableDefinitions.map((definition) => definition.key);

const definitionByKey = new Map(contractVariableDefinitions.map((definition) => [definition.key, definition]));

export const extractContractVariableKeys = (htmlParts: Array<string | null | undefined>) => {
  const found = new Set<string>();
  const tokenPattern = /{{\s*([a-zA-Z0-9_.]+)\s*}}/gu;
  for (const html of htmlParts) {
    if (!html) continue;
    for (const match of html.matchAll(tokenPattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
};

export const assertTemplateVariablesCompatible = (
  applicability: ContractTemplateApplicability,
  htmlParts: Array<string | null | undefined>
) => {
  const keys = extractContractVariableKeys(htmlParts);
  for (const key of keys) {
    const definition = definitionByKey.get(key);
    if (!definition) {
      throw new Error(`Variável de contrato desconhecida: {{${key}}}`);
    }

    if (applicability === 'BOTH' && definition.applicability.length !== 2) {
      throw new Error(`O modelo para ambas as partes só pode usar variáveis comuns. Remova {{${key}}}.`);
    }

    if (applicability !== 'BOTH' && !definition.applicability.includes(applicability)) {
      throw new Error(`A variável {{${key}}} não é compatível com a aplicabilidade ${applicability}.`);
    }
  }

  return keys;
};

export const assertTemplateSupportsParty = (
  applicability: ContractTemplateApplicability,
  partyType: ContractPartyType
) => {
  if (applicability !== 'BOTH' && applicability !== partyType) {
    const partyLabel = partyType === 'STUDENT' ? 'aluno' : 'colaborador';
    throw new Error(`Este modelo não está disponível para contrato de ${partyLabel}.`);
  }
};

const readContextValue = (context: Record<string, unknown>, key: string) =>
  key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, context);

export const assertUsedContractVariablesFilled = (
  usedKeys: string[],
  context: Record<string, unknown>
) => {
  const missing = usedKeys.filter((key) => {
    const value = readContextValue(context, key);
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(`Não foi possível preencher as variáveis obrigatórias: ${missing.map((key) => `{{${key}}}`).join(', ')}.`);
  }
};
