import type {
  PreRegistrationAdminLeadSummaryDTO,
  PreRegistrationAdminStatus,
  StudentOnboardingModuleStatus,
} from '@corrida/types';
import { CheckCircle2, CircleDashed, Clock3 } from 'lucide-react';

export const STATUS_LABELS: Record<PreRegistrationAdminStatus, string> = {
  LEAD: 'Lead',
  INVITED: 'Convite enviado',
  PRE_REGISTRATION_IN_PROGRESS: 'Em preenchimento',
  PRE_REGISTRATION_COMPLETED: 'Aguardando revisão',
  READY_FOR_ENROLLMENT: 'Pronto para matrícula',
  ACTIVE_STUDENT: 'Convertido',
  DISCARDED: 'Descartado',
};

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as Array<
  [PreRegistrationAdminStatus, string]
>;

export function statusClass(status: PreRegistrationAdminStatus) {
  if (status === 'READY_FOR_ENROLLMENT' || status === 'ACTIVE_STUDENT') return 'ts-badge-success';
  if (status === 'DISCARDED') return 'ts-badge-danger';
  if (status === 'PRE_REGISTRATION_COMPLETED') return 'ts-badge-warning';
  if (status === 'PRE_REGISTRATION_IN_PROGRESS' || status === 'INVITED') {
    return 'ts-badge-info';
  }
  return 'ts-badge-secondary';
}

export function formatDate(value?: string) {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function contactLine(lead: PreRegistrationAdminLeadSummaryDTO) {
  return [lead.contacts.phone, lead.contacts.email].filter(Boolean).join(' • ') || 'Contato pendente';
}

export function ProgressState({
  label,
  status,
}: {
  label: string;
  status: StudentOnboardingModuleStatus;
}) {
  const Icon = status === 'COMPLETED' ? CheckCircle2 : status === 'IN_PROGRESS' ? Clock3 : CircleDashed;
  const text = status === 'COMPLETED' ? 'Concluído' : status === 'IN_PROGRESS' ? 'Em andamento' : 'Não iniciado';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {text}
      </span>
    </div>
  );
}
