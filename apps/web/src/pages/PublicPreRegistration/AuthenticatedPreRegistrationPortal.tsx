import { useEffect, useState, type ReactNode } from 'react';
import type { PreRegistrationSessionDTO } from '@corrida/types';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLeadOnboardingSummary } from '../../hooks/useLeadOnboardingSummary';
import { preRegistrationPublicService } from '../../services/pre-registration-public.service';
import { useAuthStore } from '../../stores/useAuthStore';

const COMPLETED_STATUSES = new Set(['PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT']);
const secondaryLinkClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const primaryLinkClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

function BackToHomeLink() {
  return (
    <Link to="/inicio" className={secondaryLinkClass}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para início
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 sm:py-8">
      <main className="mx-auto w-full max-w-6xl space-y-5">{children}</main>
    </div>
  );
}

function Message({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
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

function NextSteps({ session }: { session: PreRegistrationSessionDTO }) {
  if (!session.nextSteps.length) return null;
  return (
    <section aria-labelledby="lead-next-steps-title">
      <h2 id="lead-next-steps-title" className="text-xl font-semibold text-slate-950">
        Próximos passos opcionais
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {session.nextSteps.map((step) => (
          <article key={step.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Estado: {nextStepLabel(step.status)}
            </p>
            <Link to={step.href} className={`${secondaryLinkClass} mt-4 border-blue-600 text-blue-700`}>
              {step.action === 'START' ? 'Iniciar' : step.action === 'CONTINUE' ? 'Continuar' : 'Consultar conclusão'}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function MainPortal({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  const preferredAlunoId = (location.state as { preferredAlunoId?: string } | null)?.preferredAlunoId;
  const { state, retry } = useLeadOnboardingSummary(isAuthenticated, preferredAlunoId);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (state.status === 'active-student') return <Navigate to="/inicio" replace />;
  if (state.status === 'loading') {
    return (
      <Shell>
        <BackToHomeLink />
        <Message
          title="Carregando seu pré-cadastro..."
          description="Estamos buscando o estado mais recente do seu processo."
          action={<Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-label="Carregando" />}
        />
      </Shell>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-0">
        <div className="bg-slate-100 px-4 pt-5 sm:px-6 sm:pt-8">
          <div className="mx-auto w-full max-w-6xl space-y-5">
            <BackToHomeLink />
            <Message
              title="Não foi possível carregar o resumo do pré-cadastro"
              description={state.message}
              action={
                <button type="button" onClick={retry} className={primaryLinkClass}>
                  Tentar carregar o resumo novamente
                </button>
              }
            />
          </div>
        </div>
        <div id="pre-registration-flow">{children}</div>
      </div>
    );
  }
  if (state.status === 'discarded') {
    return (
      <Shell>
        <BackToHomeLink />
        <Message
          title="Processo encerrado"
          description="Seu processo de pré-matrícula foi encerrado. Não é possível retomar o pré-cadastro, a Anamnese ou o PAR-Q por aqui."
        />
      </Shell>
    );
  }
  if (state.status === 'not-a-lead') {
    return (
      <Shell>
        <BackToHomeLink />
        <Message
          title="Nenhum pré-cadastro disponível"
          description="Não encontramos um processo de pré-matrícula disponível para esta conta."
        />
      </Shell>
    );
  }

  const { session } = state;
  const completed = COMPLETED_STATUSES.has(session.status);
  const readyForEnrollment = session.status === 'READY_FOR_ENROLLMENT';

  return (
    <div className="space-y-0">
      <div className="bg-slate-100 px-4 pt-5 sm:px-6 sm:pt-8">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <BackToHomeLink />
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">Pré-cadastro</p>
                <h1 className="mt-1 text-2xl font-semibold">Dados cadastrais</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {completed
                    ? 'Consulte os dados já enviados. Após a conclusão, esta visão é somente para leitura.'
                    : 'Continue o preenchimento dos seus dados pessoais a partir do ponto salvo.'}
                </p>
              </div>
              {completed ? (
                <Link
                  to={`/pre-cadastro?view=dados&alunoId=${encodeURIComponent(session.alunoId)}`}
                  className={primaryLinkClass}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Ver pré-cadastro
                </Link>
              ) : (
                <a href="#pre-registration-flow" className={primaryLinkClass}>
                  Continuar pré-cadastro
                </a>
              )}
            </div>
          </section>
        </div>
      </div>

      {readyForEnrollment ? (
        <div className="bg-slate-100 px-4 pb-8 pt-5 sm:px-6">
          <div className="mx-auto w-full max-w-6xl space-y-5">
            <Message
              title="Pré-cadastro concluído e em análise"
              description="Seus dados cadastrais permanecem somente para consulta neste fluxo."
            />
            <NextSteps session={session} />
          </div>
        </div>
      ) : (
        <div id="pre-registration-flow" className="scroll-mt-4">{children}</div>
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
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
}

function display(value?: string) {
  return value?.trim() || 'Não informado';
}

function DataGroup({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
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
    void (async () => {
      try {
        const processes = await preRegistrationPublicService.listProcesses();
        const selected = requestedAlunoId
          ? processes.find((process) => process.alunoId === requestedAlunoId)
          : processes.find((process) => COMPLETED_STATUSES.has(process.status));
        if (!selected) throw new Error('Não encontramos esse pré-cadastro vinculado à sua conta.');
        const session = await preRegistrationPublicService.getSession(selected.alunoId);
        if (active) setState({ status: 'ready', session });
      } catch (error) {
        if (!active) return;
        const value = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
        setState({
          status: 'error',
          message:
            value.response?.data?.error ||
            value.response?.data?.message ||
            value.message ||
            'Não foi possível carregar os dados do pré-cadastro.',
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated, requestedAlunoId]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (state.status === 'loading') {
    return (
      <Shell>
        <BackToHomeLink />
        <Message title="Carregando seus dados..." description="Buscando a versão mais recente do pré-cadastro." />
      </Shell>
    );
  }
  if (state.status === 'error') {
    return (
      <Shell>
        <BackToHomeLink />
        <Message title="Não foi possível abrir o pré-cadastro" description={state.message} />
      </Shell>
    );
  }

  const { session } = state;
  if (session.status === 'ACTIVE_STUDENT') return <Navigate to="/inicio" replace />;
  if (session.status === 'DISCARDED') {
    return (
      <Shell>
        <BackToHomeLink />
        <Message title="Processo encerrado" description="Este processo foi encerrado e não pode ser retomado por aqui." />
      </Shell>
    );
  }
  if (!COMPLETED_STATUSES.has(session.status)) {
    return (
      <Shell>
        <BackToHomeLink />
        <Message
          title="Seu pré-cadastro ainda está em andamento"
          description="Conclua os dados cadastrais antes de abrir o resumo final."
          action={
            <Link to="/pre-cadastro" state={{ preferredAlunoId: session.alunoId }} className={primaryLinkClass}>
              Continuar pré-cadastro
            </Link>
          }
        />
      </Shell>
    );
  }

  const identity = session.identity;
  const gender =
    identity.gender === 'male'
      ? 'Masculino'
      : identity.gender === 'female'
        ? 'Feminino'
        : identity.gender === 'other'
          ? 'Outro'
          : 'Não informado';
  const address = [identity.addressStreet, identity.addressNumber].filter(Boolean).join(', ');
  const city = [identity.addressCity, identity.addressState].filter(Boolean).join(' - ');

  return (
    <Shell>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <BackToHomeLink />
        <Link to="/pre-cadastro" state={{ preferredAlunoId: session.alunoId }} className={secondaryLinkClass}>
          Voltar para pré-cadastro
        </Link>
      </div>
      <header className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-sm font-medium text-emerald-700">Pré-cadastro concluído</p>
        <h1 className="mt-1 text-3xl font-semibold">Seus dados cadastrais</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Esta consulta é somente para leitura. Correções após a conclusão seguem o processo normal da equipe.
        </p>
      </header>
      <DataGroup
        title="Identificação"
        items={[
          ['Nome completo', display(identity.name)],
          ['Data de nascimento', formatDate(identity.birthDate)],
          ['CPF', display(identity.cpf)],
          ['Sexo/gênero', gender],
        ]}
      />
      <DataGroup
        title="Contato"
        items={[
          ['Telefone principal', display(identity.phone)],
          ['Telefone alternativo', display(identity.additionalPhone)],
          ['E-mail principal', display(identity.email)],
          ['E-mail alternativo', display(identity.additionalEmail)],
        ]}
      />
      <DataGroup
        title="Endereço"
        items={[
          ['CEP', display(identity.addressZipCode)],
          ['Endereço', display(address)],
          ['Complemento', display(identity.addressComplement)],
          ['Bairro', display(identity.addressNeighborhood)],
          ['Cidade / UF', display(city)],
        ]}
      />
      {session.isMinor || identity.guardianName ? (
        <DataGroup
          title="Responsável"
          items={[
            ['Nome', display(identity.guardianName)],
            ['CPF', display(identity.guardianCpf)],
            ['Telefone', display(identity.guardianPhone)],
            ['E-mail', display(identity.guardianEmail)],
          ]}
        />
      ) : null}
      <DataGroup
        title="Conclusão e privacidade"
        items={[
          ['Pré-cadastro concluído em', formatDate(session.completedAt)],
          ['Aviso de privacidade', session.privacy.noticeVersion],
          ['Consentimento registrado em', formatDate(session.privacy.acceptedAt)],
        ]}
      />
    </Shell>
  );
}

export function AuthenticatedPreRegistrationPortal({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  return searchParams.get('view') === 'dados' ? (
    <PreRegistrationDataSummary />
  ) : (
    <MainPortal>{children}</MainPortal>
  );
}
