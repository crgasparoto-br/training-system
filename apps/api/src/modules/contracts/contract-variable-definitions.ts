export type ContractVariableGroup =
  | 'aluno'
  | 'responsavel'
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
};

const groupLabels: Record<ContractVariableGroup, string> = {
  aluno: 'Aluno',
  responsavel: 'Responsável',
  empresa: 'Empresa',
  professor: 'Professor',
  servico: 'Serviços',
  contrato: 'Contrato',
};

const definitions: Array<Omit<ContractVariableDefinition, 'token' | 'groupLabel'>> = [
  { key: 'aluno.nome', group: 'aluno', label: 'Nome do aluno', description: 'Nome completo do aluno vinculado ao contrato.', example: 'Mariana Silva' },
  { key: 'aluno.cpf', group: 'aluno', label: 'CPF do aluno', description: 'CPF cadastrado no perfil do aluno.', example: '12345678900' },
  { key: 'aluno.rg', group: 'aluno', label: 'RG do aluno', description: 'Documento de identidade cadastrado no perfil do aluno.', example: '12.345.678-9' },
  { key: 'aluno.enderecoCompleto', group: 'aluno', label: 'Endereço completo do aluno', description: 'Endereço consolidado com logradouro, número, complemento, bairro, cidade, estado e CEP.', example: 'Rua das Flores, 100, Centro, Sorocaba - SP, 18000-000' },
  { key: 'responsavel.nome', group: 'responsavel', label: 'Nome do responsável', description: 'Nome do responsável informado na geração do contrato. Na ausência, usa o nome do aluno.', example: 'Carlos Silva' },
  { key: 'responsavel.cpf', group: 'responsavel', label: 'CPF do responsável', description: 'CPF do responsável informado na geração do contrato. Na ausência, usa o CPF do aluno.', example: '98765432100' },
  { key: 'responsavel.email', group: 'responsavel', label: 'E-mail do responsável', description: 'E-mail do responsável pelo contrato. Na ausência, usa o e-mail da conta do aluno.', example: 'responsavel@exemplo.com' },
  { key: 'empresa.razaoSocial', group: 'empresa', label: 'Razão social', description: 'Nome jurídico da empresa ou do prestador responsável pelo contrato.', example: 'ACESSO Saúde e Performance Ltda.' },
  { key: 'empresa.cnpj', group: 'empresa', label: 'CNPJ', description: 'CNPJ cadastrado para a empresa responsável pelo contrato.', example: '57636561000107' },
  { key: 'empresa.cref', group: 'empresa', label: 'CREF da empresa', description: 'Registro da empresa ou do prestador no Conselho Regional de Educação Física.', example: '000000-G/SP' },
  { key: 'empresa.endereco', group: 'empresa', label: 'Endereço da empresa', description: 'Endereço consolidado da empresa ou do prestador responsável.', example: 'Av. Principal, 500, Sorocaba - SP, 18000-000' },
  { key: 'professor.nome', group: 'professor', label: 'Nome do professor', description: 'Nome do professor responsável pelo aluno ou informado na geração do contrato.', example: 'Prof. João Souza' },
  { key: 'professor.cref', group: 'professor', label: 'CREF do professor', description: 'Registro profissional do professor responsável no Conselho Regional de Educação Física.', example: '123456-G/SP' },
  { key: 'servico.nome', group: 'servico', label: 'Nome do serviço', description: 'Nome principal do serviço ou plano vinculado ao contrato.', example: 'Plano Essencial | Personal Trainer' },
  { key: 'servico.codigo', group: 'servico', label: 'Código do serviço', description: 'Código estável usado para identificar o serviço no catálogo comercial.', example: 'plano_essencial' },
  { key: 'servico.categoria', group: 'servico', label: 'Categoria do serviço', description: 'Categoria comercial formatada do serviço principal.', example: 'Serviço individual' },
  { key: 'servico.resumo', group: 'servico', label: 'Resumo do serviço', description: 'Resumo curto exibido no catálogo comercial.', example: 'Gestão completa e individualizada do programa de treinamento.' },
  { key: 'servico.oQueE', group: 'servico', label: 'O que é?', description: 'Descrição institucional completa cadastrada na seção “O que é?”.', example: 'Treinamento personalizado com prescrição baseada em evidências.' },
  { key: 'servico.publicoAlvo', group: 'servico', label: 'A quem se destina?', description: 'Público-alvo cadastrado para o serviço.', example: 'Pessoas que buscam segurança, autonomia, saúde e performance.' },
  { key: 'servico.itensInclusos', group: 'servico', label: 'Itens inclusos', description: 'Lista textual dos itens ativos cadastrados em “O que o compõe?”.', example: 'Avaliação física periódica; gestão do treinamento; consultoria individual' },
  { key: 'servico.quantidadeItensInclusos', group: 'servico', label: 'Quantidade de itens inclusos', description: 'Quantidade de itens ativos da apresentação comercial do serviço.', example: '7' },
  { key: 'servico.plano.componentes', group: 'servico', label: 'Componentes do plano', description: 'Lista dos serviços e opções ativos vinculados à composição relacional de um plano combinado.', example: 'Personal Trainer — 2x por semana; Pilates · 1 sessão por semana' },
  { key: 'servico.valor', group: 'servico', label: 'Valor do serviço', description: 'Valor mensal efetivamente informado na geração do contrato, formatado em reais.', example: 'R$ 1.322,00' },
  { key: 'servico.duracaoSessao', group: 'servico', label: 'Duração da sessão', description: 'Variável de compatibilidade. Permanece vazia enquanto o catálogo não possuir duração de sessão estruturada.', example: '60 minutos' },
  { key: 'servico.quantidadeSemanal', group: 'servico', label: 'Quantidade semanal', description: 'Variável de compatibilidade. Permanece vazia enquanto uma opção comercial não for selecionada explicitamente.', example: '2 sessões por semana' },
  { key: 'contrato.valorMensal', group: 'contrato', label: 'Valor mensal', description: 'Valor mensal negociado e informado na geração do contrato.', example: 'R$ 1.322,00' },
  { key: 'contrato.valorMensalExtenso', group: 'contrato', label: 'Valor mensal por extenso', description: 'Representação textual do valor mensal do contrato.', example: 'R$ 1.322,00 reais' },
  { key: 'contrato.diaVencimento', group: 'contrato', label: 'Dia de vencimento', description: 'Dia do mês definido para vencimento das mensalidades.', example: '10' },
  { key: 'contrato.horarios', group: 'contrato', label: 'Dias e horários', description: 'Dias e horários informados para prestação do serviço.', example: 'Segundas e quartas-feiras, às 7h' },
  { key: 'contrato.dataInicio', group: 'contrato', label: 'Data de início', description: 'Data prevista para início da prestação dos serviços.', example: '15/07/2026' },
  { key: 'contrato.dataAssinatura', group: 'contrato', label: 'Data de assinatura', description: 'Data da assinatura ou geração do documento.', example: '10/07/2026' },
];

export const contractVariableDefinitions: ContractVariableDefinition[] = definitions.map((definition) => ({
  ...definition,
  token: `{{${definition.key}}}`,
  groupLabel: groupLabels[definition.group],
}));

export const contractVariables = contractVariableDefinitions.map((definition) => definition.key);
