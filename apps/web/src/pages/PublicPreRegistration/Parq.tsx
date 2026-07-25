import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, Save } from 'lucide-react';
import type { ParqQuestionKey, ParqResponses, ParqSessionDTO } from '@corrida/types';
import { PARQ_CATALOG_VERSION } from '@corrida/types';
import { useAuthStore } from '../../stores/useAuthStore';
import { preRegistrationPublicService } from '../../services/pre-registration-public.service';

function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">{children}</div>;
}

function apiError(error: unknown): { message: string; code?: string } {
  const response = (error as { response?: { status?: number; data?: { error?: string; message?: string; details?: { code?: string }; code?: string } } }).response;
  return {
    message: response?.data?.error || response?.data?.message || 'Não foi possível continuar. Tente novamente.',
    code: response?.data?.details?.code || response?.data?.code,
  };
}

function AnswerChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {[
        { value: true, label: 'Sim' },
        { value: false, label: 'Não' },
      ].map((option) => (
        <label
          key={String(option.value)}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 ${
            value === option.value
              ? 'border-blue-600 bg-blue-50 text-blue-950'
              : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'
          }`}
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function Parq() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const alunoId = searchParams.get('alunoId') || '';
  const { isAuthenticated } = useAuthStore();
  const [session, setSession] = useState<ParqSessionDTO | null>(null);
  const [responses, setResponses] = useState<ParqResponses>({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [respondAgain, setRespondAgain] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [completionKey, setCompletionKey] = useState(() => crypto.randomUUID());

  const complete = useMemo(
    () => Boolean(session?.catalog.questions.every((question) => typeof responses[question.key] === 'boolean')),
    [responses, session]
  );

  const load = async () => {
    if (!alunoId) {
      navigate('/pre-cadastro', { replace: true });
      return;
    }
    setLoading(true);
    setError('');
    setConflict(false);
    try {
      const value = await preRegistrationPublicService.getParq(alunoId);
      setSession(value);
      setResponses(value.responses);
      setConsentAccepted(Boolean(value.consent.acceptedAt));
      setRespondAgain(false);
      setCompletionKey(crypto.randomUUID());
    } catch (reason) {
      const parsed = apiError(reason);
      if ((reason as { response?: { status?: number } }).response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    void load();
  }, [alunoId, isAuthenticated]);

  const payload = () => {
    if (!session) throw new Error('Sessão indisponível');
    return {
      catalogVersion: PARQ_CATALOG_VERSION,
      expectedVersion: session.version,
      responses,
      consent: {
        accepted: true as const,
        privacyNoticeVersion: session.consent.requiredVersion,
      },
    };
  };

  const saveDraft = async () => {
    if (!session || !consentAccepted) {
      setError('Leia e aceite o aviso de privacidade antes de salvar.');
      return;
    }
    setSaving(true);
    setError('');
    setConflict(false);
    try {
      const next = await preRegistrationPublicService.saveParqDraft(alunoId, payload());
      setSession(next);
      setResponses(next.responses);
      setRespondAgain(true);
    } catch (reason) {
      const parsed = apiError(reason);
      setConflict(parsed.code === 'CONCURRENT_MODIFICATION');
      setError(parsed.message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!session || !consentAccepted || !declarationAccepted || !complete) {
      setError('Responda todas as perguntas e confirme as declarações antes de concluir.');
      return;
    }
    setSaving(true);
    setError('');
    setConflict(false);
    try {
      const next = await preRegistrationPublicService.completeParq(alunoId, {
        ...payload(),
        declarationAccepted: true,
        idempotencyKey: completionKey,
      });
      setSession(next);
      setResponses({});
      setDeclarationAccepted(false);
      setRespondAgain(false);
      setCompletionKey(crypto.randomUUID());
    } catch (reason) {
      const parsed = apiError(reason);
      setConflict(parsed.code === 'CONCURRENT_MODIFICATION');
      setError(parsed.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PublicShell>
        <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
          <span className="ml-3 text-slate-700">Carregando PAR-Q…</span>
        </main>
      </PublicShell>
    );
  }

  if (!session) {
    return (
      <PublicShell>
        <main className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-9">
          <AlertTriangle className="h-10 w-10 text-rose-600" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">PAR-Q indisponível</h1>
          <p className="mt-2 text-slate-600">{error || 'Não foi possível carregar este questionário.'}</p>
          <button type="button" onClick={() => void load()} className="mt-6 min-h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white">Tentar novamente</button>
        </main>
      </PublicShell>
    );
  }

  const latestSubmission = session.latestSubmission;
  const showCompleted = latestSubmission && session.status !== 'IN_PROGRESS' && !respondAgain;
  if (showCompleted && latestSubmission) {
    const hasAlert = latestSubmission.positiveCount > 0;
    return (
      <PublicShell>
        <main className="mx-auto max-w-3xl space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <CheckCircle2 className="h-11 w-11 text-emerald-600" aria-hidden="true" />
            <h1 className="mt-4 text-3xl font-semibold text-slate-950">PAR-Q concluído</h1>
            <p className="mt-2 text-slate-600">
              Registrado em {new Date(latestSubmission.submittedAt).toLocaleString('pt-BR')}.
            </p>
            {hasAlert ? (
              <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status">
                <strong>Análise profissional necessária.</strong>
                <p className="mt-1 text-sm leading-6">Foram identificadas {latestSubmission.positiveCount} resposta(s) positiva(s). A academia fará a análise apropriada. Isso não bloqueia a conclusão comercial do pré-cadastro.</p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                Nenhuma resposta positiva foi identificada. Isso não constitui diagnóstico nem liberação médica para atividade física.
              </div>
            )}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => { setRespondAgain(true); setResponses({}); setConsentAccepted(false); }} className="min-h-11 rounded-xl border border-blue-600 px-5 font-semibold text-blue-700">Responder novamente</button>
              <button type="button" onClick={() => navigate('/pre-cadastro')} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-700">Voltar ao pré-cadastro</button>
            </div>
          </section>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <main className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <button type="button" onClick={() => navigate('/pre-cadastro')} className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-slate-700">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
          </button>
          <ClipboardCheck className="mt-4 h-11 w-11 text-blue-600" aria-hidden="true" />
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Questionário PAR-Q</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">Responda com atenção. Respostas positivas serão encaminhadas para análise profissional. O questionário não constitui diagnóstico, prescrição ou liberação médica.</p>
          {session.status === 'NEEDS_REPEAT' ? (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="status">
              Existe um registro antigo que não contém evidências suficientes para ser considerado uma submissão concluída. Responda novamente para criar um histórico válido.
            </div>
          ) : null}
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="parq-consent-title">
          <h2 id="parq-consent-title" className="text-xl font-semibold text-slate-950">Privacidade e consentimento</h2>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-4 text-sm leading-6 text-slate-700">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
            <span>Li e aceito o aviso de privacidade vigente para o tratamento destas informações de saúde.</span>
          </label>
        </section>

        <section className="space-y-4" aria-labelledby="parq-questions-title">
          <h2 id="parq-questions-title" className="sr-only">Perguntas do PAR-Q</h2>
          {session.catalog.questions.map((question) => (
            <fieldset key={question.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <legend className="px-1 text-base font-semibold leading-7 text-slate-950">
                {question.order}. {question.text}
              </legend>
              <AnswerChoice
                name={`parq-${question.key}`}
                value={responses[question.key]}
                onChange={(value) => setResponses((current) => ({ ...current, [question.key as ParqQuestionKey]: value }))}
              />
            </fieldset>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-4 text-sm leading-6 text-slate-700">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={declarationAccepted} onChange={(event) => setDeclarationAccepted(event.target.checked)} />
            <span>Declaro que as respostas informadas são verdadeiras e compreendo que o PAR-Q não substitui avaliação médica ou profissional.</span>
          </label>

          {error ? <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</div> : null}
          {conflict ? <button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-xl border border-amber-500 px-4 font-semibold text-amber-900">Recarregar alterações mais recentes</button> : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={saving || !consentAccepted} onClick={() => void saveDraft()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-600 px-5 font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Salvar e continuar depois
            </button>
            <button type="button" disabled={saving || !complete || !consentAccepted || !declarationAccepted} onClick={() => void submit()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Concluir PAR-Q
            </button>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
