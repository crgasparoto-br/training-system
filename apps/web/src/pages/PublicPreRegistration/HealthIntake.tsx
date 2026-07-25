import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  Loader2,
  LockKeyhole,
  Pill,
  RefreshCcw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import type {
  HealthIntakeAnswersDTO,
  HealthIntakeSessionDTO,
  HealthIntakeStep,
  SaveHealthIntakeStepDTO,
} from '@corrida/types';
import { useAuthStore } from '../../stores/useAuthStore';
import { preRegistrationPublicService } from '../../services/pre-registration-public.service';

const STEPS: Array<{
  key: HealthIntakeStep;
  title: string;
  description: string;
  icon: typeof HeartPulse;
}> = [
  { key: 'CONSENT', title: 'Privacidade', description: 'Consentimento para dados de saúde', icon: ShieldCheck },
  { key: 'HEALTH_HISTORY', title: 'Histórico', description: 'Condições de saúde e objetivo', icon: Stethoscope },
  { key: 'MEDICATIONS', title: 'Medicações', description: 'Medicamentos e alergias', icon: Pill },
  { key: 'INJURIES', title: 'Restrições', description: 'Lesões e limitações', icon: HeartPulse },
  { key: 'ACTIVITY', title: 'Atividade', description: 'Experiência e observações', icon: Activity },
  { key: 'REVIEW', title: 'Revisão', description: 'Confirmação das respostas', icon: ClipboardCheck },
];

const emptyAnswers: HealthIntakeAnswersDTO = {};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 sm:py-8">
      {children}
    </div>
  );
}

function apiFailure(error: unknown) {
  const response = (error as {
    response?: {
      status?: number;
      data?: {
        error?: string;
        message?: string;
        code?: string;
        details?: { code?: string; currentVersion?: number; fields?: string[] };
      };
    };
    message?: string;
  }).response;
  const code = response?.data?.details?.code || response?.data?.code;
  return {
    status: response?.status,
    code,
    currentVersion: response?.data?.details?.currentVersion,
    fields: response?.data?.details?.fields,
    message:
      response?.data?.error ||
      response?.data?.message ||
      (error as { message?: string }).message ||
      'Não foi possível continuar.',
  };
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
  required,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-800">
      <span>
        {label}
        {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
      </span>
      <textarea
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        maxLength={4000}
        required={required}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
      />
      {hint ? <span className="block text-xs font-normal leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

function YesNoField({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { value: true, label: 'Sim' },
          { value: false, label: 'Não' },
        ].map((option) => (
          <label
            key={String(option.value)}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
              value === option.value
                ? 'border-blue-600 bg-blue-50 text-blue-950'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="font-medium">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function stepPayload(
  step: HealthIntakeStep,
  session: HealthIntakeSessionDTO,
  answers: HealthIntakeAnswersDTO,
  consentAccepted: boolean
): SaveHealthIntakeStepDTO {
  const consent =
    !session.consent.acceptedAt && consentAccepted
      ? {
          privacyNoticeVersion: session.consent.requiredVersion,
          accepted: true as const,
        }
      : undefined;

  switch (step) {
    case 'CONSENT':
      return {
        expectedVersion: session.version,
        step,
        consent: {
          privacyNoticeVersion: session.consent.requiredVersion,
          accepted: true,
        },
        data: {},
      };
    case 'HEALTH_HISTORY':
      return {
        expectedVersion: session.version,
        step,
        consent,
        data: {
          mainGoal: answers.mainGoal,
          hasMedicalConditions: answers.hasMedicalConditions,
          medicalHistory: answers.medicalHistory,
        },
      };
    case 'MEDICATIONS':
      return {
        expectedVersion: session.version,
        step,
        consent,
        data: {
          usesMedication: answers.usesMedication,
          currentMedications: answers.currentMedications,
          hasAllergies: answers.hasAllergies,
          allergies: answers.allergies,
        },
      };
    case 'INJURIES':
      return {
        expectedVersion: session.version,
        step,
        consent,
        data: {
          hasInjuries: answers.hasInjuries,
          injuriesHistory: answers.injuriesHistory,
          hasExerciseRestrictions: answers.hasExerciseRestrictions,
          exerciseRestrictions: answers.exerciseRestrictions,
        },
      };
    case 'ACTIVITY':
      return {
        expectedVersion: session.version,
        step,
        consent,
        data: {
          trainingBackground: answers.trainingBackground,
          observations: answers.observations,
        },
      };
    case 'REVIEW':
      return { expectedVersion: session.version, step, consent, data: {} };
  }
}

function summaryValue(value: boolean | undefined, details?: string) {
  if (value === undefined) return 'Pendente';
  if (!value) return 'Não';
  return details?.trim() || 'Sim';
}

export function HealthIntake() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const alunoId = searchParams.get('alunoId') || '';
  const { isAuthenticated } = useAuthStore();
  const [session, setSession] = useState<HealthIntakeSessionDTO | null>(null);
  const [answers, setAnswers] = useState<HealthIntakeAnswersDTO>(emptyAnswers);
  const [step, setStep] = useState<HealthIntakeStep>('CONSENT');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const stepIndex = useMemo(() => STEPS.findIndex((item) => item.key === step), [step]);

  const load = async () => {
    if (!alunoId) {
      navigate('/pre-cadastro', { replace: true });
      return;
    }
    setLoading(true);
    setError('');
    setConflict(false);
    try {
      const value = await preRegistrationPublicService.getHealthIntake(alunoId);
      setSession(value);
      setAnswers(value.answers);
      setStep(value.status === 'COMPLETED' ? 'REVIEW' : value.currentStep);
      setConsentAccepted(Boolean(value.consent.acceptedAt));
    } catch (reason) {
      const failure = apiFailure(reason);
      setError(failure.message);
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
    // load is intentionally bound to the selected process only.
  }, [alunoId, isAuthenticated, navigate]);

  const updateAnswer = <K extends keyof HealthIntakeAnswersDTO>(
    key: K,
    value: HealthIntakeAnswersDTO[K]
  ) => setAnswers((current) => ({ ...current, [key]: value }));

  const save = async (advance: boolean) => {
    if (!session) return;
    if (!session.consent.acceptedAt && !consentAccepted) {
      setError('Leia e aceite o aviso de privacidade antes de salvar informações de saúde.');
      setStep('CONSENT');
      return;
    }
    setSaving(true);
    setError('');
    setConflict(false);
    try {
      const value = await preRegistrationPublicService.saveHealthIntakeStep(
        alunoId,
        stepPayload(step, session, answers, consentAccepted)
      );
      setSession(value);
      setAnswers(value.answers);
      setConsentAccepted(Boolean(value.consent.acceptedAt));
      if (advance) setStep(value.currentStep);
    } catch (reason) {
      const failure = apiFailure(reason);
      setConflict(failure.code === 'CONCURRENT_MODIFICATION');
      setError(
        failure.code === 'CONCURRENT_MODIFICATION'
          ? 'Esta Anamnese foi alterada em outro acesso. Recarregue a versão mais recente antes de continuar.'
          : failure.message
      );
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!session || !declarationAccepted) {
      setError('Confirme que revisou as respostas antes de concluir.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const value = await preRegistrationPublicService.completeHealthIntake(alunoId, {
        expectedVersion: session.version,
        declarationAccepted: true,
      });
      setSession(value);
      setAnswers(value.answers);
      setStep('REVIEW');
    } catch (reason) {
      const failure = apiFailure(reason);
      setConflict(failure.code === 'CONCURRENT_MODIFICATION');
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden="true" />
          <p className="mt-4 font-medium text-slate-700">Carregando sua Anamnese Inicial...</p>
        </div>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <main className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
          <AlertTriangle className="h-10 w-10 text-red-600" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold">Não foi possível abrir a Anamnese</h1>
          <p className="mt-2 text-slate-600">{error || 'Volte ao pré-cadastro e tente novamente.'}</p>
          <button type="button" onClick={() => navigate('/pre-cadastro')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar aos pré-cadastros
          </button>
        </main>
      </Shell>
    );
  }

  const completed = session.status === 'COMPLETED';

  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
              <HeartPulse className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700">{session.tenant.name}</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Anamnese Inicial</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Informe somente o que souber. Este registro apoia o acompanhamento profissional e não substitui avaliação médica, diagnóstico ou liberação para treino.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/pre-cadastro')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Agora não
          </button>
        </header>

        {completed ? (
          <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950" role="status">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Anamnese concluída</h2>
                <p className="mt-1 text-sm leading-6">Suas respostas foram registradas e permanecem disponíveis para consulta.</p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Etapas da Anamnese" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <ol className="space-y-2">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const active = item.key === step;
                const passed = completed || index < stepIndex;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      disabled={!completed && index > stepIndex}
                      onClick={() => (completed || index <= stepIndex) && setStep(item.key)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                        active ? 'bg-blue-50 text-blue-950' : 'text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span className={`mt-0.5 rounded-lg p-2 ${passed ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {passed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {error ? (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950" role="alert">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <p>{error}</p>
                    {conflict ? (
                      <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 font-semibold text-red-800">
                        <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                        Recarregar versão mais recente
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 'CONSENT' ? (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-blue-700">Etapa 1 de 6</p>
                  <h2 className="mt-1 text-2xl font-semibold">Privacidade e consentimento</h2>
                  <p className="mt-3 leading-7 text-slate-600">As respostas desta etapa são dados de saúde. Elas serão usadas pela academia para orientar o acompanhamento e ficam vinculadas somente ao cadastro selecionado.</p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  <div className="flex gap-3">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p>Você pode interromper agora e continuar depois. Nenhuma resposta de saúde será salva antes do aceite.</p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-300 p-4">
                  <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} className="mt-1" />
                  <span className="text-sm leading-6 text-slate-700">
                    Li o <a href={session.tenant.privacyNoticeUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">aviso de privacidade</a> e autorizo o registro destas informações para a finalidade descrita.
                  </span>
                </label>
              </div>
            ) : null}

            {step === 'HEALTH_HISTORY' ? (
              <div className="space-y-6">
                <div><p className="text-sm font-medium text-blue-700">Etapa 2 de 6</p><h2 className="mt-1 text-2xl font-semibold">Histórico de saúde</h2></div>
                <TextAreaField label="Qual é seu principal objetivo?" value={answers.mainGoal} onChange={(value) => updateAnswer('mainGoal', value)} hint="Exemplo: melhorar condicionamento, reduzir dores ou voltar a correr." />
                <YesNoField legend="Possui alguma condição de saúde diagnosticada?" value={answers.hasMedicalConditions} onChange={(value) => updateAnswer('hasMedicalConditions', value)} />
                {answers.hasMedicalConditions ? <TextAreaField required label="Descreva as condições de saúde" value={answers.medicalHistory} onChange={(value) => updateAnswer('medicalHistory', value)} /> : null}
              </div>
            ) : null}

            {step === 'MEDICATIONS' ? (
              <div className="space-y-6">
                <div><p className="text-sm font-medium text-blue-700">Etapa 3 de 6</p><h2 className="mt-1 text-2xl font-semibold">Medicações e alergias</h2></div>
                <YesNoField legend="Usa medicamentos atualmente?" value={answers.usesMedication} onChange={(value) => updateAnswer('usesMedication', value)} />
                {answers.usesMedication ? <TextAreaField required label="Informe os medicamentos em uso" value={answers.currentMedications} onChange={(value) => updateAnswer('currentMedications', value)} /> : null}
                <YesNoField legend="Possui alguma alergia relevante?" value={answers.hasAllergies} onChange={(value) => updateAnswer('hasAllergies', value)} />
                {answers.hasAllergies ? <TextAreaField required label="Descreva as alergias" value={answers.allergies} onChange={(value) => updateAnswer('allergies', value)} /> : null}
              </div>
            ) : null}

            {step === 'INJURIES' ? (
              <div className="space-y-6">
                <div><p className="text-sm font-medium text-blue-700">Etapa 4 de 6</p><h2 className="mt-1 text-2xl font-semibold">Lesões e restrições</h2></div>
                <YesNoField legend="Possui lesão atual ou histórico de lesões importante?" value={answers.hasInjuries} onChange={(value) => updateAnswer('hasInjuries', value)} />
                {answers.hasInjuries ? <TextAreaField required label="Descreva as lesões" value={answers.injuriesHistory} onChange={(value) => updateAnswer('injuriesHistory', value)} /> : null}
                <YesNoField legend="Recebeu orientação para evitar ou adaptar algum exercício?" value={answers.hasExerciseRestrictions} onChange={(value) => updateAnswer('hasExerciseRestrictions', value)} />
                {answers.hasExerciseRestrictions ? <TextAreaField required label="Descreva as restrições ou adaptações" value={answers.exerciseRestrictions} onChange={(value) => updateAnswer('exerciseRestrictions', value)} /> : null}
              </div>
            ) : null}

            {step === 'ACTIVITY' ? (
              <div className="space-y-6">
                <div><p className="text-sm font-medium text-blue-700">Etapa 5 de 6</p><h2 className="mt-1 text-2xl font-semibold">Experiência com atividade física</h2></div>
                <TextAreaField label="Conte sobre sua experiência com exercícios" value={answers.trainingBackground} onChange={(value) => updateAnswer('trainingBackground', value)} hint="Inclua atividades praticadas, frequência e há quanto tempo, quando souber." />
                <TextAreaField label="Deseja acrescentar alguma observação?" value={answers.observations} onChange={(value) => updateAnswer('observations', value)} />
              </div>
            ) : null}

            {step === 'REVIEW' ? (
              <div className="space-y-6">
                <div><p className="text-sm font-medium text-blue-700">Etapa 6 de 6</p><h2 className="mt-1 text-2xl font-semibold">Revise suas respostas</h2><p className="mt-2 text-slate-600">Volte às etapas anteriores para corrigir qualquer informação antes de concluir.</p></div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Objetivo', answers.mainGoal || 'Não informado'],
                    ['Condições de saúde', summaryValue(answers.hasMedicalConditions, answers.medicalHistory)],
                    ['Medicações', summaryValue(answers.usesMedication, answers.currentMedications)],
                    ['Alergias', summaryValue(answers.hasAllergies, answers.allergies)],
                    ['Lesões', summaryValue(answers.hasInjuries, answers.injuriesHistory)],
                    ['Restrições de exercício', summaryValue(answers.hasExerciseRestrictions, answers.exerciseRestrictions)],
                    ['Experiência com exercícios', answers.trainingBackground || 'Não informada'],
                    ['Observações', answers.observations || 'Não informadas'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 p-4">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
                {!completed ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-300 p-4">
                    <input type="checkbox" checked={declarationAccepted} onChange={(event) => setDeclarationAccepted(event.target.checked)} className="mt-1" />
                    <span className="text-sm leading-6 text-slate-700">Confirmo que revisei as respostas e que elas representam as informações que tenho neste momento.</span>
                  </label>
                ) : null}
              </div>
            ) : null}

            <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" disabled={saving || stepIndex === 0} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].key)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 disabled:opacity-40">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Etapa anterior
              </button>
              {completed ? (
                <button type="button" onClick={() => navigate('/pre-cadastro')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white">Voltar aos pré-cadastros</button>
              ) : step === 'REVIEW' ? (
                <button type="button" disabled={saving || !declarationAccepted} onClick={() => void complete()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  Concluir Anamnese
                </button>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-300 px-4 font-semibold text-blue-700 disabled:opacity-50">Salvar e continuar depois</button>
                  <button type="button" disabled={saving || (step === 'CONSENT' && !consentAccepted)} onClick={() => void save(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    Salvar e avançar
                  </button>
                </div>
              )}
            </footer>
          </section>
        </div>
      </main>
    </Shell>
  );
}
