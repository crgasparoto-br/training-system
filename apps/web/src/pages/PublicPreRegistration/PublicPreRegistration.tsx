import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  HeartPulse,
  Loader2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type {
  PreRegistrationClaimRole,
  PreRegistrationIdentityDTO,
  PreRegistrationPublicLandingDTO,
  PreRegistrationSessionDTO,
  PreRegistrationStep,
} from '@corrida/types';
import { useAuthStore } from '../../stores/useAuthStore';
import { preRegistrationPublicService } from '../../services/pre-registration-public.service';

const STEPS: Array<{
  key: PreRegistrationStep;
  title: string;
  description: string;
  icon: typeof UserRound;
}> = [
  { key: 'IDENTIFICATION', title: 'Identificação', description: 'Seus dados pessoais', icon: UserRound },
  { key: 'CONTACT', title: 'Contato', description: 'Como falar com você', icon: UsersRound },
  { key: 'ADDRESS', title: 'Endereço', description: 'Seu endereço atual', icon: MapPin },
  { key: 'GUARDIAN', title: 'Responsável', description: 'Quando necessário', icon: ShieldCheck },
  { key: 'PRIVACY', title: 'Privacidade', description: 'Revisão e consentimento', icon: FileCheck2 },
];

type FormData = PreRegistrationIdentityDTO & {
  guardianRelationship?: string;
  guardianDeclarationAccepted?: boolean;
};

const emptyForm: FormData = {};

function stepsForSession(session: Pick<PreRegistrationSessionDTO, 'isMinor' | 'claimRole'>) {
  return STEPS.filter(
    (step) => step.key !== 'GUARDIAN' || session.isMinor || session.claimRole === 'GUARDIAN'
  );
}

function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
    return response?.data?.error || response?.data?.message || 'Não foi possível concluir a operação.';
  }
  return 'Não foi possível concluir a operação.';
}

function Field({
  label,
  name,
  value,
  type = 'text',
  required,
  autoComplete,
  placeholder,
  onChange,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-800">
      <span>
        {label}
        {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
      </span>
      <input
        name={name}
        type={type}
        value={value || ''}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
      />
    </label>
  );
}

function PublicLanding({ token }: { token: string }) {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [landing, setLanding] = useState<PreRegistrationPublicLandingDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<PreRegistrationClaimRole>('STUDENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let active = true;
    preRegistrationPublicService
      .open(token)
      .then((value) => active && setLanding(value))
      .catch((reason) => active && setError(apiErrorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') {
        await login({ email, password });
        await preRegistrationPublicService.claim({ token, role });
        navigate('/pre-cadastro', { replace: true });
        return;
      }
      await preRegistrationPublicService.registerAndClaim(token, { name, email, password, role });
      window.location.replace('/pre-cadastro');
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <FullPageLoading text="Validando seu convite..." />;
  }

  if (!landing) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-10 w-10 text-slate-500" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">Este link não está disponível</h1>
          <p className="mt-2 text-slate-600">{error || 'Solicite um novo convite à academia.'}</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-9">
          <div className="flex items-center gap-3">
            {landing.tenant.logoUrl ? (
              <img src={landing.tenant.logoUrl} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-500/20">
                <HeartPulse className="h-7 w-7 text-blue-300" aria-hidden="true" />
              </div>
            )}
            <div>
              <p className="text-sm text-slate-300">Convite de pré-matrícula</p>
              <h1 className="text-2xl font-semibold">{landing.tenant.name}</h1>
            </div>
          </div>

          <p className="mt-8 max-w-xl text-lg leading-8 text-slate-200">
            Complete seus dados com segurança. O progresso fica salvo para você continuar depois, inclusive em outro dispositivo.
          </p>

          <ol className="mt-8 space-y-3" aria-label="Etapas previstas">
            {landing.stages.map((stage, index) => (
              <li key={stage.key} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500 text-sm font-semibold">
                  {index + 1}
                </span>
                <div>
                  <p className="font-medium">{stage.title}</p>
                  <p className="text-sm text-slate-300">{stage.optional ? 'Etapa opcional e independente' : 'Necessário para concluir o pré-cadastro'}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{landing.approximateDuration}</div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Válido até {new Date(landing.expiresAt).toLocaleDateString('pt-BR')}</div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Seus dados ficam protegidos.</strong> O link serve apenas para iniciar e vincular o processo. Depois, o acesso exige sua conta.
          </div>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Escolha como continuar">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>
              Já tenho conta
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>
              Criar acesso
            </button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-800">Você está preenchendo como</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['STUDENT', 'GUARDIAN'] as const).map((option) => (
                  <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${role === option ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                    <input type="radio" name="claimRole" value={option} checked={role === option} onChange={() => setRole(option)} />
                    <span className="text-sm font-medium">{option === 'STUDENT' ? 'O próprio aluno' : 'Responsável legal'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === 'register' ? <Field label="Nome completo" name="name" value={name} required autoComplete="name" onChange={setName} /> : null}
            <Field label="E-mail" name="email" type="email" value={email} required autoComplete="email" placeholder="seu@email.com" onChange={setEmail} />
            <Field label="Senha" name="password" type="password" value={password} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={setPassword} />

            <button disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
              {mode === 'login' ? 'Entrar e continuar' : 'Criar acesso e continuar'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            Ao continuar, você ainda poderá revisar os dados antes da conclusão.{' '}
            <a className="font-medium text-blue-700 underline" href={landing.tenant.privacyNoticeUrl} target="_blank" rel="noreferrer">Leia o aviso de privacidade</a>.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}

function AuthenticatedFlow() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [session, setSession] = useState<PreRegistrationSessionDTO | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const value = await preRegistrationPublicService.getSession();
      setSession(value);
      setForm((current) => ({ ...current, ...value.identity }));
      const availableSteps = stepsForSession(value);
      const stepIndex = Math.max(
        0,
        availableSteps.findIndex((step) => step.key === value.currentStep)
      );
      setActiveStep(stepIndex);
      setPrivacyAccepted(false);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    void load();
  }, [isAuthenticated, load, navigate]);

  const setValue = (key: keyof FormData, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedMessage('');
  };

  const visibleSteps = useMemo(
    () => (session ? stepsForSession(session) : STEPS),
    [session]
  );

  const currentStep = visibleSteps[Math.min(activeStep, visibleSteps.length - 1)] || visibleSteps[0];

  const saveCurrent = async (goForward: boolean) => {
    if (!session || !currentStep) return;
    setSaving(true);
    setError('');
    try {
      const next = await preRegistrationPublicService.saveStep({
        expectedVersion: session.version,
        step: currentStep.key,
        data: form,
      });
      setSession(next);
      setForm((current) => ({ ...current, ...next.identity }));
      setSavedMessage('Alterações salvas. Você pode continuar depois com a mesma conta.');
      if (goForward) setActiveStep((index) => Math.min(index + 1, visibleSteps.length - 1));
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!session) return;
    if (!privacyAccepted) {
      setError('Confirme que leu e aceitou o aviso de privacidade antes de concluir.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const completed = await preRegistrationPublicService.complete({
        expectedVersion: session.version,
        privacyAccepted,
      });
      setSession(completed);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <FullPageLoading text="Carregando seu pré-cadastro..." />;
  if (!session) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Não foi possível abrir o pré-cadastro</h1>
          <p className="mt-2 text-slate-600">{error}</p>
          <button onClick={() => void load()} className="mt-5 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">Tentar novamente</button>
        </div>
      </PublicShell>
    );
  }

  if (session.status === 'PRE_REGISTRATION_COMPLETED') {
    return (
      <PublicShell>
        <main className="mx-auto w-full max-w-4xl space-y-6">
          <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-9">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
            <h1 className="mt-4 text-3xl font-semibold text-slate-950">Pré-cadastro concluído</h1>
            <p className="mt-2 max-w-2xl text-slate-600">Seus dados foram enviados para revisão da {session.tenant.name}. Isso não significa liberação automática para treino.</p>
            {session.completedAt ? <p className="mt-4 text-sm text-slate-500">Concluído em {new Date(session.completedAt).toLocaleString('pt-BR')}</p> : null}
          </section>
          <section aria-labelledby="next-steps-title">
            <h2 id="next-steps-title" className="text-xl font-semibold text-slate-950">Próximos passos opcionais</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {session.nextSteps.map((step) => (
                <article key={step.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <HeartPulse className="h-7 w-7 text-blue-600" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Estado: {step.status === 'NOT_STARTED' ? 'Não iniciado' : step.status === 'IN_PROGRESS' ? 'Em andamento' : 'Concluído'}</p>
                  <button disabled={!step.href} className="mt-4 min-h-11 w-full rounded-xl border border-blue-600 px-4 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
                    {step.action === 'START' ? 'Iniciar' : step.action === 'CONTINUE' ? 'Continuar' : 'Consultar conclusão'}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <main className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:self-start">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            {session.tenant.logoUrl ? <img src={session.tenant.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <HeartPulse className="h-9 w-9 text-blue-600" />}
            <div><p className="text-xs text-slate-500">Pré-matrícula</p><p className="font-semibold text-slate-950">{session.tenant.name}</p></div>
          </div>
          <p className="mt-4 text-sm text-slate-600">Etapa {Math.min(activeStep + 1, visibleSteps.length)} de {visibleSteps.length}: <strong>{currentStep?.title}</strong></p>
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1" aria-label="Progresso do pré-cadastro">
            {visibleSteps.map((step, index) => {
              const Icon = step.icon;
              const completed = index < activeStep;
              const active = index === activeStep;
              return (
                <li key={step.key}>
                  <button type="button" onClick={() => setActiveStep(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${active ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${completed ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                      {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="hidden lg:block"><span className="block font-medium">{step.title}</span><span className="block text-xs opacity-75">{step.description}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <header className="border-b border-slate-100 pb-5">
            <p className="text-sm font-medium text-blue-700">{currentStep?.description}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{currentStep?.title}</h1>
            <p className="mt-2 text-sm text-slate-600">Preencha os campos abaixo. Salve para retomar com segurança em qualquer dispositivo.</p>
          </header>

          {error ? <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Revise antes de continuar.</strong><br />{error}</div> : null}
          {savedMessage ? <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{savedMessage}</div> : null}
          {session.duplicateWarnings.length ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">A academia precisará revisar possíveis cadastros semelhantes por {session.duplicateWarnings.join(' e ')}. Seu rascunho foi preservado.</div> : null}

          <div className="mt-6">
            {currentStep?.key === 'IDENTIFICATION' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Nome completo" name="name" value={form.name} required autoComplete="name" onChange={(value) => setValue('name', value)} /></div>
                <Field label="Data de nascimento" name="birthDate" type="date" value={form.birthDate?.slice(0, 10)} required autoComplete="bday" onChange={(value) => setValue('birthDate', value)} />
                <Field label="CPF" name="cpf" value={form.cpf} required autoComplete="off" placeholder="000.000.000-00" onChange={(value) => setValue('cpf', value)} />
                <label className="block space-y-2 text-sm font-medium text-slate-800">
                  <span>Sexo/gênero</span>
                  <select value={form.gender || ''} onChange={(event) => setValue('gender', event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base">
                    <option value="">Selecione</option><option value="male">Masculino</option><option value="female">Feminino</option><option value="other">Outro</option>
                  </select>
                </label>
              </div>
            ) : null}

            {currentStep?.key === 'CONTACT' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefone principal" name="phone" type="tel" value={form.phone} required autoComplete="tel" onChange={(value) => setValue('phone', value)} />
                <Field label="E-mail principal" name="email" type="email" value={form.email} required autoComplete="email" onChange={(value) => setValue('email', value)} />
              </div>
            ) : null}

            {currentStep?.key === 'ADDRESS' ? (
              <div className="grid gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2"><Field label="CEP" name="addressZipCode" value={form.addressZipCode} autoComplete="postal-code" onChange={(value) => setValue('addressZipCode', value)} /></div>
                <div className="sm:col-span-4"><Field label="Rua" name="addressStreet" value={form.addressStreet} autoComplete="address-line1" onChange={(value) => setValue('addressStreet', value)} /></div>
                <div className="sm:col-span-2"><Field label="Número" name="addressNumber" value={form.addressNumber} autoComplete="address-line2" onChange={(value) => setValue('addressNumber', value)} /></div>
                <div className="sm:col-span-4"><Field label="Complemento" name="addressComplement" value={form.addressComplement} onChange={(value) => setValue('addressComplement', value)} /></div>
                <div className="sm:col-span-2"><Field label="Bairro" name="addressNeighborhood" value={form.addressNeighborhood} onChange={(value) => setValue('addressNeighborhood', value)} /></div>
                <div className="sm:col-span-3"><Field label="Cidade" name="addressCity" value={form.addressCity} autoComplete="address-level2" onChange={(value) => setValue('addressCity', value)} /></div>
                <div className="sm:col-span-1"><Field label="UF" name="addressState" value={form.addressState} autoComplete="address-level1" onChange={(value) => setValue('addressState', value)} /></div>
                <p className="sm:col-span-6 text-sm text-slate-500">Caso o preenchimento automático por CEP esteja indisponível, informe o endereço manualmente.</p>
              </div>
            ) : null}

            {currentStep?.key === 'GUARDIAN' ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome do responsável legal" name="guardianName" value={form.guardianName} required onChange={(value) => setValue('guardianName', value)} />
                  <Field label="CPF do responsável" name="guardianCpf" value={form.guardianCpf} required onChange={(value) => setValue('guardianCpf', value)} />
                  <Field label="Telefone do responsável" name="guardianPhone" type="tel" value={form.guardianPhone} onChange={(value) => setValue('guardianPhone', value)} />
                  <Field label="E-mail do responsável" name="guardianEmail" type="email" value={form.guardianEmail} onChange={(value) => setValue('guardianEmail', value)} />
                  {session.claimRole === 'GUARDIAN' ? <Field label="Vínculo com o menor" name="guardianRelationship" value={form.guardianRelationship} required placeholder="Ex.: mãe, pai, tutor" onChange={(value) => setValue('guardianRelationship', value)} /> : null}
                </div>
                {session.claimRole === 'GUARDIAN' ? (
                  <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                    <input type="checkbox" checked={form.guardianDeclarationAccepted === true} onChange={(event) => setValue('guardianDeclarationAccepted', event.target.checked)} className="mt-1" />
                    <span>Declaro que sou responsável legal e autorizo o preenchimento deste pré-cadastro. Este vínculo será registrado e poderá ser revogado pela academia.</span>
                  </label>
                ) : null}
              </div>
            ) : null}

            {currentStep?.key === 'PRIVACY' ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h2 className="font-semibold text-slate-950">Revise antes de concluir</h2>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-slate-500">Nome</dt><dd className="font-medium text-slate-900">{form.name || 'Pendente'}</dd></div>
                    <div><dt className="text-slate-500">Nascimento</dt><dd className="font-medium text-slate-900">{form.birthDate ? new Date(`${form.birthDate.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Pendente'}</dd></div>
                    <div><dt className="text-slate-500">Telefone</dt><dd className="font-medium text-slate-900">{form.phone || 'Pendente'}</dd></div>
                    <div><dt className="text-slate-500">E-mail</dt><dd className="font-medium text-slate-900">{form.email || 'Pendente'}</dd></div>
                  </dl>
                </div>
                {session.missingRequiredFields.length ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Ainda existem campos obrigatórios pendentes: {session.missingRequiredFields.join(', ')}.
                  </div>
                ) : null}
                <label htmlFor="privacy-consent" className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                  <input
                    id="privacy-consent"
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) => {
                      setPrivacyAccepted(event.target.checked);
                      setError('');
                    }}
                    className="mt-1"
                  />
                  <span>Li e aceito o <a href={session.privacy.noticeUrl} target="_blank" rel="noreferrer" className="font-semibold underline">aviso de privacidade vigente</a>. O aceite registrará a versão {session.privacy.noticeVersion}, data, hora e minha identidade autenticada.</span>
                </label>
                <p className="text-sm text-slate-600">A conclusão não ativa matrícula, contrato, cobrança, plano, agenda ou liberação para treino.</p>
              </div>
            ) : null}
          </div>

          <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" disabled={activeStep === 0 || saving} onClick={() => setActiveStep((index) => Math.max(0, index - 1))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 font-medium text-slate-700 disabled:opacity-40"><ArrowLeft className="h-4 w-4" />Voltar</button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={saving} onClick={() => void saveCurrent(false)} className="min-h-11 rounded-xl border border-blue-600 px-4 font-semibold text-blue-700 disabled:opacity-50">Salvar e continuar depois</button>
              {currentStep?.key === 'PRIVACY' ? (
                <button type="button" disabled={saving || !privacyAccepted} onClick={() => void complete()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Concluir pré-cadastro</button>
              ) : (
                <button type="button" disabled={saving} onClick={() => void saveCurrent(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Salvar e avançar</button>
              )}
            </div>
          </footer>
        </section>
      </main>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 sm:py-8">{children}</div>;
}

function FullPageLoading({ text }: { text: string }) {
  return (
    <PublicShell>
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden="true" />
        <p className="mt-4 font-medium text-slate-700">{text}</p>
      </div>
    </PublicShell>
  );
}

export function PublicPreRegistration() {
  const { token } = useParams<{ token?: string }>();
  return token ? <PublicLanding token={token} /> : <AuthenticatedFlow />;
}
