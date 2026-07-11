import type { GeneratedContract } from './contract.service';

export type StudentContractDeliveryView = {
  canSend: boolean;
  actionLabel: string;
  description: string;
  requiresConfirmation: boolean;
};

type ResolveStudentContractDeliveryInput = {
  selectedContractId?: string;
  contract?: Pick<GeneratedContract, 'status'> | null;
  loading?: boolean;
  error?: boolean;
};

export const resolveStudentContractDelivery = ({
  selectedContractId,
  contract,
  loading = false,
  error = false,
}: ResolveStudentContractDeliveryInput): StudentContractDeliveryView => {
  if (!selectedContractId) {
    return {
      canSend: false,
      actionLabel: 'Enviar para assinatura',
      description: 'Selecione um contrato para preparar o envio.',
      requiresConfirmation: false,
    };
  }

  if (selectedContractId.startsWith('template:')) {
    return {
      canSend: false,
      actionLabel: 'Enviar para assinatura',
      description: 'Salve o cadastro para gerar o documento antes de enviá-lo para assinatura.',
      requiresConfirmation: false,
    };
  }

  if (loading) {
    return {
      canSend: false,
      actionLabel: 'Consultando contrato',
      description: 'Carregando o estado atual do documento.',
      requiresConfirmation: false,
    };
  }

  if (error || !contract) {
    return {
      canSend: false,
      actionLabel: 'Envio indisponível',
      description: 'Não foi possível confirmar se este contrato pode ser enviado.',
      requiresConfirmation: false,
    };
  }

  if (contract.status === 'SIGNED') {
    return {
      canSend: false,
      actionLabel: 'Contrato assinado',
      description: 'O aluno já concluiu a assinatura deste documento.',
      requiresConfirmation: false,
    };
  }

  if (contract.status === 'REJECTED') {
    return {
      canSend: false,
      actionLabel: 'Contrato recusado',
      description: 'O aluno recusou este documento. Revise as condições e gere um novo contrato.',
      requiresConfirmation: false,
    };
  }

  if (contract.status === 'CANCELLED') {
    return {
      canSend: false,
      actionLabel: 'Contrato cancelado',
      description: 'Um contrato cancelado não pode ser enviado para assinatura.',
      requiresConfirmation: false,
    };
  }

  if (contract.status === 'EXPIRED') {
    return {
      canSend: false,
      actionLabel: 'Contrato expirado',
      description: 'Gere um novo contrato antes de iniciar outro processo de assinatura.',
      requiresConfirmation: false,
    };
  }

  if (contract.status === 'SENT' || contract.status === 'VIEWED') {
    return {
      canSend: true,
      actionLabel: 'Gerar novo link',
      description: 'Um novo envio substitui o link anterior. Compartilhe o novo endereço com o aluno.',
      requiresConfirmation: true,
    };
  }

  return {
    canSend: true,
    actionLabel: 'Enviar para assinatura',
    description: 'O sistema criará um link seguro para compartilhamento manual por WhatsApp ou e-mail.',
    requiresConfirmation: false,
  };
};
