import { Link } from 'react-router-dom';
import type { PreRegistrationNextStepDTO, StudentLifecycleStatus } from '@corrida/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import type { LeadOnboardingSummaryState } from '../hooks/useLeadOnboardingSummary';

const BASIC_STATUS_LABEL: Record<StudentLifecycleStatus, string> = {
  LEAD: 'Convite ainda não iniciado',
  INVITED: 'Convite recebido, cadastro não iniciado',
  PRE_REGISTRATION_IN_PROGRESS: 'Cadastro básico em andamento',
  PRE_REGISTRATION_COMPLETED: 'Cadastro básico concluído',
  READY_FOR_ENROLLMENT: 'Cadastro básico concluído, em análise para matrícula',
  ACTIVE_STUDENT: 'Aluno ativo',
  DISCARDED: 'Processo encerrado',
};

const CADASTRO_CONCLUIDO_STATUSES = new Set<StudentLifecycleStatus>([
  'PRE_REGISTRATION_COMPLETED',
  'READY_FOR_ENROLLMENT',
]);

function nextStepLabel(step: PreRegistrationNextStepDTO | undefined) {
  if (!step) return 'Não disponível';
  if (step.status === 'NOT_STARTED') return 'Não iniciado';
  if (step.status === 'IN_PROGRESS') return 'Em andamento';
  return 'Concluído';
}

function nextStepActionLabel(step: PreRegistrationNextStepDTO) {
  if (step.action === 'START') return 'Responder';
  if (step.action === 'CONTINUE') return 'Continuar';
  return 'Ver concluído';
}

function parqStatusCopy(
  parq: import('@corrida/types').ParqSessionDTO | null,
  fallbackStep: PreRegistrationNextStepDTO | undefined
): {
  label: string;
  description: string;
  href: string;
  actionLabel: string;
  disabled: boolean;
  nextAction: string;
} {
  const href = fallbackStep?.href || '/pre-cadastro/par-q';
  const fallbackNextAction =
    fallbackStep?.status === 'IN_PROGRESS'
      ? 'Continue o PAR-Q quando puder.'
      : fallbackStep?.status === 'NOT_STARTED'
        ? 'Responda o PAR-Q quando puder.'
        : 'Aguarde o contato da equipe para os próximos passos da matrícula.';

  if (!parq) {
    return {
      label: nextStepLabel(fallbackStep),
      description: 'Questionário de prontidão para atividade física.',
      href,
      actionLabel: fallbackStep ? nextStepActionLabel(fallbackStep) : 'Responder PAR-Q',
      disabled: false,
      nextAction: fallbackNextAction,
    };
  }

  switch (parq.status) {
    case 'NOT_STARTED':
      return {
        label: 'Não iniciado',
        description: 'Questionário de prontidão para atividade física.',
        href,
        actionLabel: 'Responder PAR-Q',
        disabled: false,
        nextAction: 'Responda o PAR-Q quando puder.',
      };
    case 'IN_PROGRESS':
      return {
        label: 'Em andamento',
        description: 'Continue de onde parou.',
        href,
        actionLabel: 'Continuar PAR-Q',
        disabled: false,
        nextAction: 'Continue o PAR-Q quando puder.',
      };
    case 'COMPLETED_NO_ALERT':
      return {
        label: 'Concluído',
        description: 'Nenhum alerta identificado nas respostas.',
        href,
        actionLabel: 'Ver concluído',
        disabled: false,
        nextAction: 'Aguarde o contato da equipe para os próximos passos da matrícula.',
      };
    case 'COMPLETED_REVIEW_REQUIRED':
      return {
        label: 'Análise profissional necessária',
        description:
          'Suas respostas foram encaminhadas para análise profissional. Isso não significa reprovação da matrícula nem liberação para exercício.',
        href,
        actionLabel: 'Ver respostas enviadas',
        disabled: false,
        nextAction: 'Aguarde a análise profissional do PAR-Q e o contato da equipe.',
      };
    case 'NEEDS_REPEAT':
      return {
        label: 'Necessita nova resposta',
        description: 'Precisamos que você responda novamente o questionário atual.',
        href,
        actionLabel: 'Responder PAR-Q',
        disabled: false,
        nextAction: 'Responda o PAR-Q quando puder.',
      };
    default:
      return {
        label: nextStepLabel(fallbackStep),
        description: 'Questionário de prontidão para atividade física.',
        href,
        actionLabel: fallbackStep ? nextStepActionLabel(fallbackStep) : 'Responder PAR-Q',
        disabled: false,
        nextAction: fallbackNextAction,
      };
  }
}

function LoadingState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Carregando seu cadastro...</CardTitle>
        <CardDescription>Estamos buscando o estado atual do seu pré-cadastro.</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Não foi possível carregar seu pré-cadastro</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          Tentar novamente
        </button>
      </CardContent>
    </Card>
  );
}

function DiscardedState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processo encerrado</CardTitle>
        <CardDescription>
          Seu processo de pré-matrícula foi encerrado. Não é possível continuar o cadastro, a
          Anamnese ou o PAR-Q por aqui. Entre em contato com a equipe caso acredite que isso seja
          um engano.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function isGenericHomeFallback(state: LeadOnboardingSummaryState): boolean {
  return state.status === 'not-a-lead' || state.status === 'active-student';
}

export function LeadOnboardingHome({
  state,
  onRetry,
}: {
  state: LeadOnboardingSummaryState;
  onRetry: () => void;
}) {
  const retry = onRetry;

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (state.status === 'not-a-lead') return null;
  if (state.status === 'active-student') return null;
  if (state.status === 'discarded') return <DiscardedState />;

  const { session, parq } = state;
  const cadastroCompleto = CADASTRO_CONCLUIDO_STATUSES.has(session.status);
  const anamneseStep = session.nextSteps.find((step) => step.key === 'ANAMNESIS');
  const parqStep = session.nextSteps.find((step) => step.key === 'PARQ');
  const parqCopy = parqStatusCopy(parq, parqStep);

  const nextAction = !cadastroCompleto
    ? 'Conclua o seu cadastro básico para liberar a Anamnese e o PAR-Q.'
    : anamneseStep?.status !== 'COMPLETED'
      ? 'Responda a Anamnese Inicial quando puder.'
      : parqCopy.nextAction;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Seu processo de pré-matrícula</CardTitle>
          <CardDescription>
            Você ainda não é um aluno ativo. Aqui você acompanha o andamento do seu cadastro,
            Anamnese e PAR-Q enquanto sua matrícula é processada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Cadastro básico: </span>
            {BASIC_STATUS_LABEL[session.status]}
          </p>
          <p>
            <span className="font-medium text-foreground">Anamnese: </span>
            {cadastroCompleto ? nextStepLabel(anamneseStep) : 'Disponível após concluir o cadastro básico'}
          </p>
          <p>
            <span className="font-medium text-foreground">PAR-Q: </span>
            {cadastroCompleto ? parqCopy.label : 'Disponível após concluir o cadastro básico'}
          </p>
          <p>
            <span className="font-medium text-foreground">Próxima ação: </span>
            {nextAction}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Meus dados do pré-cadastro</CardTitle>
            <CardDescription>
              {cadastroCompleto
                ? 'Consulte os dados que você já enviou. A revisão não permite edição por aqui.'
                : 'Continue de onde parou o preenchimento dos seus dados pessoais.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/pre-cadastro"
              state={{ preferredAlunoId: session.alunoId }}
              className="inline-flex items-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              {cadastroCompleto ? 'Ver meus dados' : 'Continuar cadastro'}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anamnese Inicial</CardTitle>
            <CardDescription>
              {cadastroCompleto
                ? anamneseStep?.description || 'Conte informações importantes para orientar seu acompanhamento.'
                : 'Próxima etapa disponível após concluir o cadastro básico.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estado: {cadastroCompleto ? nextStepLabel(anamneseStep) : 'Bloqueado'}
            </p>
            {cadastroCompleto && anamneseStep ? (
              <Link
                to={anamneseStep.href}
                className="inline-flex items-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                {nextStepActionLabel(anamneseStep)} Anamnese
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground">
                Concluir cadastro primeiro
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PAR-Q</CardTitle>
            <CardDescription>
              {cadastroCompleto
                ? parqCopy.description
                : 'Próxima etapa disponível após concluir o cadastro básico.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estado: {cadastroCompleto ? parqCopy.label : 'Bloqueado'}
            </p>
            {cadastroCompleto ? (
              <Link
                to={parqCopy.href}
                className="inline-flex items-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                {parqCopy.actionLabel}
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground">
                Concluir cadastro primeiro
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
