import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BellRing, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Button, buttonClassName } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import {
  getStudentSelfServiceErrorKind,
  isProfileReviewNotification,
  STUDENT_PROFILE_REVIEW_ROUTE,
  studentSelfService,
  type StudentNotification,
  type StudentProfileReview,
  type StudentSelfServiceErrorKind,
  type StudentSummary,
  withStudentContractContext,
} from '../../services/student-self.service';

type EntryState =
  | { status: 'loading' }
  | {
      status: 'ready';
      summary: StudentSummary;
      review: StudentProfileReview | null;
      notifications: StudentNotification[];
    }
  | { status: 'failed'; kind: StudentSelfServiceErrorKind };

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

function notificationBelongsToReview(
  notification: StudentNotification,
  review: StudentProfileReview
) {
  const data = notification.data;
  if (!data || typeof data !== 'object') return false;

  const reviewId = typeof data.reviewId === 'string' ? data.reviewId : null;
  if (reviewId) return reviewId === review.id;

  const alunoId = typeof data.alunoId === 'string' ? data.alunoId : null;
  return alunoId === review.alunoId;
}

function FailureCard({ kind, onRetry }: { kind: StudentSelfServiceErrorKind; onRetry: () => void }) {
  if (kind === 'contract-required') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="space-y-1">
              <CardTitle>Selecione o vínculo para continuar</CardTitle>
              <CardDescription>
                Sua conta possui mais de um vínculo ativo. Abra o Sistema ACESSO pelo vínculo correto para consultar esta revisão cadastral.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (kind === 'access-denied') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso indisponível</CardTitle>
          <CardDescription>
            Não foi possível acessar as informações desta revisão com a sessão atual. Entre novamente se o acesso tiver expirado.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (kind === 'not-found') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vínculo de aluno não encontrado</CardTitle>
          <CardDescription>
            Não encontramos um vínculo ativo de aluno para consultar a revisão cadastral nesta sessão.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Não foi possível carregar sua revisão</CardTitle>
        <CardDescription>
          Tente novamente. Se o problema continuar, você pode voltar mais tarde sem perder nenhuma revisão já solicitada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}

export function StudentProfileReviewEntry({ contractId }: { contractId?: string }) {
  const [state, setState] = useState<EntryState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const summary = await studentSelfService.getSummary(contractId);
      let review: StudentProfileReview | null = null;
      let notifications: StudentNotification[] = [];

      if (summary.hasPendingProfileReview) {
        try {
          review = await studentSelfService.getProfileReview(contractId);
        } catch {
          // O resumo é a fonte do estado da home; a rota dedicada revalida a revisão.
        }

        if (review) {
          try {
            notifications = await studentSelfService.getNotifications(contractId);
          } catch {
            // A pendência continua acionável pelo card mesmo sem a listagem de avisos.
          }
        }
      }

      setState({ status: 'ready', summary, review, notifications });
    } catch (error) {
      setState({ status: 'failed', kind: getStudentSelfServiceErrorKind(error) });
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Card aria-live="polite">
        <CardHeader>
          <CardTitle>Revisão cadastral</CardTitle>
          <CardDescription>Consultando se há alguma revisão pendente para você...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.status === 'failed') {
    return <FailureCard kind={state.kind} onRetry={load} />;
  }

  const { summary } = state;
  if (!summary.hasPendingProfileReview) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div className="space-y-1">
              <CardTitle>Nenhuma revisão cadastral pendente</CardTitle>
              <CardDescription>
                Quando for necessário conferir seus dados, a solicitação aparecerá aqui.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const destination = withStudentContractContext(STUDENT_PROFILE_REVIEW_ROUTE, contractId);
  const dueDate = formatDate(summary.nextProfileReviewAt);
  const actionableNotifications = state.review
    ? state.notifications
        .filter(isProfileReviewNotification)
        .filter((notification) => notificationBelongsToReview(notification, state.review!))
        .slice(0, 3)
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Revisão cadastral pendente</CardTitle>
                  <span className="ts-badge-warning">Ação necessária</span>
                </div>
                <CardDescription>
                  Confira seus dados cadastrais para manter suas informações atualizadas.
                  {dueDate ? ` Prazo: ${dueDate}.` : ''}
                </CardDescription>
              </div>
            </div>
            <Link to={destination} className={buttonClassName({ className: 'w-full sm:w-auto' })}>
              Abrir revisão
            </Link>
          </div>
        </CardHeader>
      </Card>

      {actionableNotifications.length > 0 ? (
        <section aria-labelledby="student-profile-review-notifications" className="space-y-2">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="student-profile-review-notifications" className="text-sm font-semibold text-foreground">
              Avisos sobre sua revisão
            </h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {actionableNotifications.map((notification) => (
              <Link
                key={notification.id}
                to={destination}
                className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-[var(--shadow-soft)] transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <p className="text-sm font-medium text-foreground">{notification.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                <span className="mt-2 inline-block text-sm font-medium text-primary">Abrir revisão</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
