import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { buttonClassName, Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import {
  getStudentContractId,
  getStudentSelfServiceErrorKind,
  STUDENT_HOME_ROUTE,
  studentSelfService,
  type StudentProfileReview as StudentProfileReviewData,
  type StudentSelfServiceErrorKind,
  withStudentContractContext,
} from '../services/student-self.service';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; review: StudentProfileReviewData | null }
  | { status: 'failed'; kind: StudentSelfServiceErrorKind };

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

function ErrorState({ kind, onRetry }: { kind: StudentSelfServiceErrorKind; onRetry: () => void }) {
  if (kind === 'contract-required') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selecione o vínculo para continuar</CardTitle>
          <CardDescription>
            Sua conta possui mais de um vínculo ativo. Abra esta revisão pelo vínculo correto para manter os dados separados.
          </CardDescription>
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
            Sua sessão não permite consultar esta revisão. Entre novamente se o acesso tiver expirado.
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
            Não encontramos um vínculo ativo de aluno para esta revisão cadastral.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Não foi possível carregar a revisão</CardTitle>
        <CardDescription>
          Tente novamente. A revisão solicitada permanece registrada mesmo se esta tela estiver temporariamente indisponível.
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

export function StudentProfileReview() {
  const location = useLocation();
  const contractId = getStudentContractId(location.search);
  const [state, setState] = useState<PageState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const review = await studentSelfService.getProfileReview(contractId);
      setState({ status: 'ready', review });
    } catch (error) {
      setState({ status: 'failed', kind: getStudentSelfServiceErrorKind(error) });
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const homeDestination = withStudentContractContext(STUDENT_HOME_ROUTE, contractId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-3">
        <Link
          to={homeDestination}
          className={buttonClassName({ variant: 'ghost', size: 'sm', className: '-ml-3 w-fit' })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para início
        </Link>
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Aluno</p>
          <h1 className="text-2xl font-bold text-foreground">Revisão cadastral</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a solicitação e o prazo da sua revisão cadastral. A conferência dos campos será feita por esta mesma página quando estiver disponível.
          </p>
        </div>
      </div>

      {state.status === 'loading' ? (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>Carregando revisão</CardTitle>
            <CardDescription>Consultando a revisão vinculada à sua conta...</CardDescription>
          </CardHeader>
        </Card>
      ) : state.status === 'failed' ? (
        <ErrorState kind={state.kind} onRetry={load} />
      ) : state.review ? (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Revisão pendente</CardTitle>
                  <span className="ts-badge-warning">Ação necessária</span>
                </div>
                <CardDescription>
                  Sua revisão está registrada e pronta para conferência.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Solicitada em</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {formatDate(state.review.requestedAt) ?? 'Data não informada'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prazo</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {formatDate(state.review.dueAt) ?? 'Sem prazo definido'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <CardTitle>Nenhuma revisão cadastral pendente</CardTitle>
                <CardDescription>
                  Não há nenhuma solicitação aberta para este vínculo no momento.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
