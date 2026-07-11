import type { GeneratedContract } from './contract.service';

export type StudentContractStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export type StudentContractStatusView = {
  label: string;
  description: string;
  approvalLabel: string;
  approved: boolean;
  tone: StudentContractStatusTone;
  signedAt?: string | null;
};

type ResolveStudentContractStatusInput = {
  selectedContractId?: string;
  contract?: Pick<GeneratedContract, 'status' | 'signedAt'> | null;
  loading?: boolean;
  error?: boolean;
};

const statusViews: Record<GeneratedContract['status'], Omit<StudentContractStatusView, 'signedAt'>> = {
  DRAFT: {
    label: 'Rascunho',
    description: 'O documento ainda está em preparação e não foi disponibilizado ao aluno.',
    approvalLabel: 'Não',
    approved: false,
    tone: 'neutral',
  },
  GENERATED: {
    label: 'Gerado — aguardando envio',
    description: 'O contrato foi gerado, mas ainda não foi enviado para assinatura.',
    approvalLabel: 'Não',
    approved: false,
    tone: 'info',
  },
  SENT: {
    label: 'Enviado — aguardando assinatura',
    description: 'O link de assinatura foi enviado, mas o aluno ainda não assinou.',
    approvalLabel: 'Não',
    approved: false,
    tone: 'warning',
  },
  VIEWED: {
    label: 'Visualizado — aguardando assinatura',
    description: 'O aluno abriu o contrato, mas ainda não concluiu a assinatura.',
    approvalLabel: 'Não',
    approved: false,
    tone: 'warning',
  },
  SIGNED: {
    label: 'Aprovado e assinado',
    description: 'O aluno concluiu a assinatura eletrônica do documento.',
    approvalLabel: 'Sim',
    approved: true,
    tone: 'success',
  },
  CANCELLED: {
    label: 'Cancelado',
    description: 'O documento foi cancelado e não pode ser considerado aprovado.',
    approvalLabel: 'Não',
    approved: false,
    tone: 'danger',
  },
  EXPIRED: {
    label: 'Expirado',
    description: 'O prazo de assinatura expirou sem conclusão pelo aluno.',
    approvalLabel: 'Não',
    approved: false,
    tone: 'danger',
  },
};

export const resolveStudentContractStatus = ({
  selectedContractId,
  contract,
  loading = false,
  error = false,
}: ResolveStudentContractStatusInput): StudentContractStatusView => {
  if (!selectedContractId) {
    return {
      label: 'Nenhum contrato selecionado',
      description: 'Selecione um contrato para acompanhar a geração, o envio e a assinatura.',
      approvalLabel: 'Não aplicável',
      approved: false,
      tone: 'neutral',
    };
  }

  if (selectedContractId.startsWith('template:')) {
    return {
      label: 'Modelo selecionado — ainda não gerado',
      description: 'Este é apenas o modelo. O aluno ainda não recebeu nem aprovou um documento.',
      approvalLabel: 'Não',
      approved: false,
      tone: 'neutral',
    };
  }

  if (loading) {
    return {
      label: 'Consultando status',
      description: 'Carregando o estado atual do documento selecionado.',
      approvalLabel: 'Verificando',
      approved: false,
      tone: 'neutral',
    };
  }

  if (error || !contract) {
    return {
      label: 'Status indisponível',
      description: 'Não foi possível consultar o estado atual deste contrato.',
      approvalLabel: 'Não confirmado',
      approved: false,
      tone: 'danger',
    };
  }

  return {
    ...statusViews[contract.status],
    signedAt: contract.signedAt,
  };
};
