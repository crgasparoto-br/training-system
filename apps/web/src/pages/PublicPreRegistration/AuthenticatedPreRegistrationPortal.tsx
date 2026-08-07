import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, FileText, HeartPulse, Loader2 } from 'lucide-react';
import type { PreRegistrationSessionDTO } from '@corrida/types';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLeadOnboardingSummary } from '../../hooks/useLeadOnboardingSummary';
import { preRegistrationPublicService } from '../../services/pre-registration-public.service';
import { useAuthStore } from '../../stores/useAuthStore';

const COMPLETED_BASIC_STATUSES = new Set(['PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT']);

function BackToHomeLink() {
  return (
    <Link
      to="/inicio"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para início
    </Link>
  );
}

function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 sm:py-8">
      <main className="mx-auto w-full max-w-6xl space-y-5">{children}</main>
    </div>
  );
}

function StatusPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

function nextStepLabel(status: string) {
  if (status === 'NOT_STARTED') return 'Não iniciado';
  if (status === 'IN_PROGRESS') return 'Em andamento';
  return 'Concluído';
}

function OptionalNextSteps({ session }: { session: PreRegistrationSessionDTO }) {
  if (session.nextSteps.length === 0) return null;
  return (
    <section aria-labelledby="authenticated-next-steps-title" className="space-y-4">
      <div>
        <h2 id="authenticated-next-steps-title" className="text-xl font-semibold text-slate-950">
          Próximos passos opcionais
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Anamnese e PAR-Q continuam opcionais e usam os formulários já vinculados ao seu processo.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {session.nextSteps.map((step) => (
          <article key={step.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <HeartPulse className="h-7 w-7 text-blue-600" aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-slate-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              Estado: {nextStepLabel(step.status)}
            </p>
            <Link
              to={step.href}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-600 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {step.action === 'START'
                ? 'Iniciar'
                : step.action === 'CONTINUE'
                  ? 'Continuar'
                  : 'Consultar conclusão'}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function AuthenticatedPreRegistrationMain({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const preferredAlunoId = (location.state as { preferredAlunoId?: string } | null)?.preferredAlunoId;
  const { state, retry } = useLeadOnboardingSummary(isAuthenticated, preferredAlunoId);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (state.status === 'active-student') return <Navigate to="/inicio" replace />;

  if (state.status === 'loading') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Carregando seu pré-cadastro..."
          description="Estamos buscando o estado mais recente do seu processo."
          action={<Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-label="Carregando" />}
        />
      </PortalShell>
    );
  }

  if (state.status === 'error') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Não foi possível carregar seu pré-cadastro"
          description={state.message}
          action={
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Tentar novamente
            </button>
          }
        />
      </PortalShell>
    );
  }

  if (state.status === 'discarded') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Processo encerrado"
          description="Seu processo de pré-matrícula foi encerrado. Não é possível retomar o pré-cadastro, a Anamnese ou o PAR-Q por aqui. Entre em contato com a equipe caso precise de orientação."
        />
      </PortalShell>
    );
  }

  if (state.status === 'not-a-lead') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Nenhum pré-cadastro disponível"
          description="Não encontramos um processo de pré-matrícula disponível para esta conta."
        />
      </PortalShell>
    );
  }

  const { session } = state;
  const basicCompleted = COMPLETED_BASIC_STATUSES.has(session.status);
  const isReadyForEnrollment = session.status === 'READY_FOR_ENROLLMENT';

  return (
    <div className="space-y-0">
      <div className="bg-slate-100 px-4 pt-5 text-slate-950 sm:px-6 sm:pt-8">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <BackToHomeLink />
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">Pré-cadastro</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">Dados cadastrais</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {basicCompleted
                    ? 'Consulte os dados já enviados. Após a conclusão, esta visão é somente para leitura.'
                    : 'Continue o preenchimento dos seus dados pessoais a partir do ponto salvo.'}
                </p>
              </div>
              {basicCompleted ? (
                <Link
                  to={`/pre-cadastro?view=dados&alunoId=${encodeURIComponent(session.alunoId)}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Ver pré-cadastro
                </Link>
              ) : (
                <a
                  href="#pre-registration-flow"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  Continuar pré-cadastro
                </a>
              )}
            </div>
          </section>
        </div>
      </div>

      {isReadyForEnrollment ? (
        <div className="bg-slate-100 px-4 pb-8 pt-5 sm:px-6">
          <div className="mx-auto w-full max-w-6xl space-y-5">
            <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-semibold text-slate-950">Pré-cadastro concluído e em análise</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Seus dados cadastrais estão concluídos e permanecem somente para consulta neste fluxo.
              </p>
            </section>
            <OptionalNextSteps session={session} />
          </div>
        </div>
      ) : (
        <div id="pre-registration-flow" className="scroll-mt-4">
          {children}
        </div>
      )}
    </div>
  );
}

type SummaryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; session: PreRegistrationSessionDTO };

function formatDate(value?: string) {
  if (!value) return 'Não informado';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function valueOrFallback(value?: string) {
  return value?.trim() ? value : 'Não informado';
}

function SummaryGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PreRegistrationDataSummary() {
  const { isAuthenticated } = useAuthStore();
  const [searchParams] = useSearchParams();
  const requestedAlunoId = searchParams.get('alunoId');
  const [state, setState] = useState<SummaryState>({ status: 'loading' });

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    const load = async () => {
      setState({ status: 'loading' });
      try {
        const processes = await preRegistrationPublicService.listProcesses();
        const selected = requestedAlunoId
          ? processes.find((process) => process.alunoId === requestedAlunoId)
          : processes.find((process) => COMPLETED_BASIC_STATUSES.has(process.status));
        if (!selected) {
          throw new Error('Não encontramos esse pré-cadastro vinculado à sua conta.');
        }
        const session = await preRegistrationPublicService.getSession(selected.alunoId);
        if (!active) return;
        setState({ status: 'ready', session });
      } catch (error) {
        if (!active) return;
        const value = error as {
          response?: { data?: { error?: string; message?: string } };
          message?: string;
        };
        setState({
          status: 'error',
          message:
            value.response?.data?.error ||
            value.response?.data?.message ||
            value.message ||
            'Não foi possível carregar os dados do pré-cadastro.',
        });
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [isAuthenticated, requestedAlunoId]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (state.status === 'loading') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Carregando seus dados..."
          description="Estamos buscando a versão mais recente do seu pré-cadastro."
          action={<Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-label="Carregando" />}
        />
      </PortalShell>
    );
  }

  if (state.status === 'error') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel title="Não foi possível abrir o pré-cadastro" description={state.message} />
      </PortalShell>
    );
  }

  const { session } = state;
  if (session.status === 'ACTIVE_STUDENT') return <Navigate to="/inicio" replace />;

  if (session.status === 'DISCARDED') {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Processo encerrado"
          description="Este processo foi encerrado e não está disponível para continuidade pelo fluxo de pré-matrícula."
        />
      </PortalShell>
    );
  }

  if (!COMPLETED_BASIC_STATUSES.has(session.status)) {
    return (
      <PortalShell>
        <BackToHomeLink />
        <StatusPanel
          title="Seu pré-cadastro ainda está em andamento"
          description="Conclua os dados cadastrais antes de abrir o resumo final."
          action={
            <Link
              to="/pre-cadastro"
              state={{ preferredAlunoId: session.alunoId }}
              className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Continuar pré-cadastro
            </Link>
          }
        />
      </PortalShell>
    );
  }

  const identity = session.identity;
  const addressLine = [identity.addressStreet, identity.addressNumber].filter(Boolean).join(', ');
  const cityLine = [identity.addressCity, identity.addressState].filter(Boolean).join(' - ');

  return (
    <PortalShell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackToHomeLink />
        <Link
          to="/pre-cadastro"
          state={{ preferredAlunoId: session.alunoId }}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Voltar para pré-cadastro
        </Link>
      </div>

      <header className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-sm font-medium text-emerald-700">Pré-cadastro concluído</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">Seus dados cadastrais</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Esta consulta é somente para leitura. Correções após a conclusão seguem o processo normal da equipe.
        </p>
      </header>

      <SummaryGroup
        title="Identificação"
        items={[
          { label: 'Nome completo', value: valueOrFallback(identity.name) },
          { label: 'Data de nascimento', value: formatDate(identity.birthDate) },
          { label: 'CPF', value: valueOrFallback(identity.cpf) },
          {
            label: 'Sexo/gênero',
            value:
              identity.gender === 'male'
                ? 'Masculino'
                : identity.gender === 'female'
                  ? 'Feminino'
                  : identity.gender === 'other'
                    ? 'Outro'
                    : 'Não informado',
          },
        ]}
      />

      <SummaryGroup
        title="Contato"
        items={[
          { label: 'Telefone principal', value: valueOrFallback(identity.phone) },
          { label: 'Telefone alternativo', value: valueOrFallback(identity.additionalPhone) },
          { label: 'E-mail principal', value: valueOrFallback(identity.email) },
          { label: 'E-mail alternativo', value: valueOrFallback(identity.additionalEmail) },
        ]}
      />

      <SummaryGroup
        title="Endereço"
        items={[
          { label: 'CEP', value: valueOrFallback(identity.addressZipCode) },
          { label: 'Endereço', value: valueOrFallback(addressLine) },
          { label: 'Complemento', value: valueOrFallback(identity.addressComplement) },
          { label: 'Bairro', value: valueOrFallback(identity.addressNeighborhood) },
          { label: 'Cidade / UF', value: valueOrFallback(cityLine) },
        ]}
      />

      {session.isMinor || identity.guardianName ? (
        <SummaryGroup
          title="Responsável"
          items={[
            { label: 'Nome', value: valueOrFallback(identity.guardianName) },
            { label: 'CPF', value: valueOrFallback(identity.guardianCpf) },
            { label: 'Telefone', value: valueOrFallback(identity.guardianPhone) },
            { label: 'E-mail', value: valueOrFallback(identity.guardianEmail) },
          ]}
        />
      ) : null}

      <SummaryGroup
        title="Conclusão e privacidade"
        items={[
          { label: 'Pré-cadastro concluído em', value: formatDate(session.completedAt) },
          { label: 'Aviso de privacidade', value: session.privacy.noticeVersion },
          { label: 'Consentimento registrado em', value: formatDate(session.privacy.acceptedAt) },
        ]}
      />
    </PortalShell>
  );
}

export function AuthenticatedPreRegistrationPortal({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  if (searchParams.get('view') === 'dados') {
    return <PreRegistrationDataSummary />;
  }
  return <AuthenticatedPreRegistrationMain>{children}</AuthenticatedPreRegistrationMain>;
}
