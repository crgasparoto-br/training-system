import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
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
  PreRegistrationProcessSummaryDTO,
  PreRegistrationPublicErrorCode,
  PreRegistrationPublicLandingDTO,
  PreRegistrationSessionDTO,
  PreRegistrationStep,
} from '@corrida/types';
import { useAuthStore } from '../../stores/useAuthStore';
import { preRegistrationPublicService } from '../../services/pre-registration-public.service';
import { useCepAutofill } from '../../hooks/useCepAutofill';
import {
  clearDraft,
  readDraft,
  writeDraft,
  type PreRegistrationDraft,
} from './preRegistrationDraft';

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

type ConflictChoice = 'SERVER' | 'LOCAL';
type IdentityFieldKey = keyof PreRegistrationIdentityDTO;

type ConflictState = {
  serverSession: PreRegistrationSessionDTO;
  localDraft: PreRegistrationDraft<FormData>;
  choices: Partial<Record<IdentityFieldKey, ConflictChoice>>;
};

type ApiFailure = {
  response?: {
    data?: {
      error?: string;
      message?: string;
      code?: PreRegistrationPublicErrorCode;
      redirectTo?: string;
      details?: {
        code?: PreRegistrationPublicErrorCode;
        redirectTo?: string;
      };
    };
  };
  message?: string;
};

const CONFLICT_FIELD_DEFINITIONS: Array<{ key: IdentityFieldKey; label: string }> = [
  { key: 'name', label: 'Nome completo' },
  { key: 'birthDate', label: 'Data de nascimento' },
  { key: 'cpf', label: 'CPF' },
  { key: 'gender', label: 'Sexo/gênero' },
  { key: 'phone', label: 'Telefone principal' },
  { key: 'additionalPhone', label: 'Telefone alternativo' },
  { key: 'email', label: 'E-mail principal' },
  { key: 'additionalEmail', label: 'E-mail alternativo' },
  { key: 'addressZipCode', label: 'CEP' },
  { key: 'addressStreet', label: 'Rua' },
  { key: 'addressNumber', label: 'Número' },
  { key: 'addressComplement', label: 'Complemento' },
  { key: 'addressNeighborhood', label: 'Bairro' },
  { key: 'addressCity', label: 'Cidade' },
  { key: 'addressState', label: 'UF' },
  { key: 'guardianName', label: 'Nome do responsável' },
  { key: 'guardianCpf', label: 'CPF do responsável' },
  { key: 'guardianPhone', label: 'Telefone do responsável' },
  { key: 'guardianEmail', label: 'E-mail do responsável' },
];

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  name: 'nome completo',
  birthDate: 'data de nascimento',
  phone: 'telefone principal',
  email: 'e-mail principal',
  cpf: 'CPF',
  guardianName: 'nome do responsável',
  guardianCpf: 'CPF do responsável',
  guardianAuthorization: 'autorização do responsável',
  guardianRelationship: 'vínculo do responsável',
  privacyNoticeVersion: 'aviso de privacidade',
  privacyAcceptedAt: 'aceite de privacidade',
};

function buildStepData(step: PreRegistrationStep, form: FormData): SavePreRegistrationStepDTO['data'] {
  switch (step) {
    case 'IDENTIFICATION':
      return {
        name: form.name,
        birthDate: form.birthDate,
        cpf: form.cpf,
        gender: form.gender,
      };
    case 'CONTACT':
      return {
        phone: form.phone,
        additionalPhone: form.additionalPhone,
        email: form.email,
        additionalEmail: form.additionalEmail,
      };
    case 'ADDRESS':
      return {
        addressZipCode: form.addressZipCode,
        addressStreet: form.addressStreet,
        addressNumber: form.addressNumber,
        addressComplement: form.addressComplement,
        addressNeighborhood: form.addressNeighborhood,
        addressCity: form.addressCity,
        addressState: form.addressState,
      };
    case 'GUARDIAN':
      return {
        guardianName: form.guardianName,
        guardianCpf: form.guardianCpf,
        guardianPhone: form.guardianPhone,
        guardianEmail: form.guardianEmail,
      };
    case 'PRIVACY':
      return {};
  }
}

function buildSaveStepInput(
  expectedVersion: number,
  step: PreRegistrationStep,
  form: FormData
): SavePreRegistrationStepDTO {
  return { expectedVersion, step, data: buildStepData(step, form) } as SavePreRegistrationStepDTO;
}

function stepsForSession(session: Pick<PreRegistrationSessionDTO, 'isMinor'>) {
  return STEPS.filter((step) => step.key !== 'GUARDIAN' || session.isMinor);
}

function parseApiError(error: unknown) {
  const value = error as ApiFailure;
  const details = value.response?.data?.details;
  return {
    message:
      value.response?.data?.error ||
      value.response?.data?.message ||
      value.message ||
      'Não foi possível concluir a operação.',
    code: value.response?.data?.code || details?.code,
    redirectTo: value.response?.data?.redirectTo || details?.redirectTo,
  };
}

function apiErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}

function comparableValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function buildConflictChoices(
  localDraft: PreRegistrationDraft<FormData>,
  serverIdentity: PreRegistrationIdentityDTO
): Partial<Record<IdentityFieldKey, ConflictChoice>> {
  const choices: Partial<Record<IdentityFieldKey, ConflictChoice>> = {};
  for (const field of CONFLICT_FIELD_DEFINITIONS) {
    const localValue = localDraft.form[field.key];
    if (localValue === undefined) continue;
    if (comparableValue(localValue) !== comparableValue(serverIdentity[field.key])) {
      choices[field.key] = 'SERVER';
    }
  }
  return choices;
}

function displayConflictValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

function Field({
  label,
  name,
  value,
  type = 'text',
  required,
  autoComplete,
  placeholder,
  inputMode,
  error,
  onChange,
  onBlur,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'decimal';
  error?: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}) {
  const fieldId = `pre-registration-${name}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="block space-y-2 text-sm font-medium text-slate-800">
      <label htmlFor={fieldId}>
        {label}
        {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        value={value || ''}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
      />
      {error ? <span id={errorId} className="block text-sm text-red-600">{error}</span> : null}
    </div>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
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
      .catch((reason) => active && setError(parseApiError(reason).message))
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
        const result = await preRegistrationPublicService.claim({ token, role });
        navigate('/pre-cadastro', {
          replace: true,
          state: { preferredAlunoId: result.alunoId },
        });
        return;
      }
      const result = await preRegistrationPublicService.registerAndClaim(token, {
        name,
        email,
        password,
        role,
      });
      navigate('/pre-cadastro', {
        replace: true,
        state: { preferredAlunoId: result.alunoId },
      });
    } catch (reason) {
      const parsed = parseApiError(reason);
      if (parsed.code === 'ACTIVE_STUDENT' && parsed.redirectTo) {
        navigate(parsed.redirectTo, { replace: true });
        return;
      }
      setError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FullPageLoading text="Validando seu convite..." />;

  if (!landing) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-10 w-10 text-slate-500" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">Este link não está disponível</h1>
          {error ? <p className="mt-2 text-slate-600">{error}</p> : null}
          <p className="mt-2 text-slate-600">Solicite um novo convite à academia para continuar.</p>
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
                  <p className="text-sm text-slate-300">
                    {stage.optional ? 'Etapa opcional e independente' : 'Necessário para concluir o pré-cadastro'}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {landing.approximateDuration}
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Válido até {new Date(landing.expiresAt).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Seus dados ficam protegidos.</strong> O link serve apenas para iniciar e vincular o processo. Depois, o acesso exige sua conta.
          </div>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Escolha como continuar">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => setMode('login')}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
            >
              Já tenho conta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => setMode('register')}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
            >
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
              {role === 'GUARDIAN' ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  O acesso de responsável somente será liberado para menor de idade já identificado e após validação independente do vínculo pela academia.
                </p>
              ) : null}
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

function OptionalModuleHandoff({ module }: { module: 'ANAMNESIS' | 'PARQ' }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true });
  }, [isAuthenticated, navigate]);

  const isAnamnesis = module === 'ANAMNESIS';
  return (
    <PublicShell>
      <main className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <HeartPulse className="h-11 w-11 text-blue-600" aria-hidden="true" />
        <p className="mt-5 text-sm font-medium text-blue-700">Próxima etapa opcional</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          {isAnamnesis ? 'Anamnese Inicial' : 'PAR-Q'}
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          {isAnamnesis
            ? 'Esta etapa reúne informações de saúde para apoiar o acompanhamento profissional.'
            : 'Este questionário registra informações de prontidão para atividade física.'}
          {' '}Ela é independente do pré-cadastro básico e não representa diagnóstico ou liberação para treino.
        </p>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          O módulo específico será disponibilizado pela etapa correspondente do fluxo. Seu pré-cadastro básico permanece concluído e você pode continuar depois.
        </div>
        <button
          type="button"
          onClick={() => navigate('/pre-cadastro', { replace: true })}
          className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar aos pré-cadastros
        </button>
      </main>
    </PublicShell>
  );
}

function ProcessSelector({
  processes,
  onSelect,
}: {
  processes: PreRegistrationProcessSummaryDTO[];
  onSelect: (process: PreRegistrationProcessSummaryDTO) => void;
}) {
  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-4xl">
        <header className="mb-6">
          <p className="text-sm font-medium text-blue-700">Pré-matrícula</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Escolha o cadastro</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Sua conta possui mais de um processo vinculado. Escolha qual deseja continuar.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {processes.map((process) => (
            <button
              key={process.alunoId}
              type="button"
              onClick={() => onSelect(process)}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <div className="flex items-start gap-3">
                {process.tenant.logoUrl ? (
                  <img src={process.tenant.logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    {process.claimRole === 'GUARDIAN' ? <UsersRound className="h-6 w-6" /> : <UserRound className="h-6 w-6" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold text-slate-950">{process.displayName}</span>
                  <span className="mt-1 block text-sm text-slate-600">{process.tenant.name}</span>
                  <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {process.requiresGuardianConfirmation
                      ? process.guardianAuthorizationRelationship
                        ? 'Aguardando validação da academia'
                        : 'Informar vínculo de responsável'
                      : process.status === 'PRE_REGISTRATION_COMPLETED'
                        ? 'Pré-cadastro concluído'
                        : 'Continuar preenchimento'}
                  </span>
                </span>
                <ArrowRight className="mt-2 h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>
      </main>
    </PublicShell>
  );
}

function ConflictResolutionPanel({
  conflict,
  onChoiceChange,
  onKeepServer,
  onApplyChoices,
}: {
  conflict: ConflictState;
  onChoiceChange: (field: IdentityFieldKey, choice: ConflictChoice) => void;
  onKeepServer: () => void;
  onApplyChoices: () => void;
}) {
  const differences = CONFLICT_FIELD_DEFINITIONS.filter(
    ({ key }) => conflict.choices[key] !== undefined
  );

  return (
    <section
      aria-labelledby="pre-registration-conflict-title"
      className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <h2 id="pre-registration-conflict-title" className="text-lg font-semibold text-amber-950">
            Escolha quais dados devem ser mantidos
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Este cadastro foi alterado em outro acesso. Para proteger as mudanças mais recentes,
            nenhum dado do seu rascunho será aplicado sem sua escolha explícita.
          </p>
        </div>
      </div>

      {differences.length > 0 ? (
        <div className="mt-5 space-y-4">
          {differences.map(({ key, label }) => {
            const choice = conflict.choices[key] || 'SERVER';
            return (
              <fieldset key={String(key)} className="rounded-xl border border-amber-200 bg-white p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">{label}</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-lg border p-3 text-sm ${choice === 'SERVER' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <input
                        type="radio"
                        name={`conflict-${String(key)}`}
                        checked={choice === 'SERVER'}
                        onChange={() => onChoiceChange(key, 'SERVER')}
                      />
                      Dados atuais da academia
                    </span>
                    <span className="mt-2 block break-words text-slate-600">
                      {displayConflictValue(conflict.serverSession.identity[key])}
                    </span>
                  </label>
                  <label className={`cursor-pointer rounded-lg border p-3 text-sm ${choice === 'LOCAL' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <input
                        type="radio"
                        name={`conflict-${String(key)}`}
                        checked={choice === 'LOCAL'}
                        onChange={() => onChoiceChange(key, 'LOCAL')}
                      />
                      Meu rascunho
                    </span>
                    <span className="mt-2 block break-words text-slate-600">
                      {displayConflictValue(conflict.localDraft.form[key])}
                    </span>
                  </label>
                </div>
              </fieldset>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-amber-200 bg-white p-4 text-sm text-slate-700">
          Não há diferenças visíveis nos campos preservados. Continue com os dados atuais para
          atualizar a versão do formulário.
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onKeepServer}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700"
        >
          Usar somente os dados atuais
        </button>
        <button
          type="button"
          onClick={onApplyChoices}
          className="min-h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white"
        >
          Aplicar minhas escolhas
        </button>
      </div>
    </section>
  );
}

function AuthenticatedFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [processes, setProcesses] = useState<PreRegistrationProcessSummaryDTO[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState<string | null>(null);
  const [session, setSession] = useState<PreRegistrationSessionDTO | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [guardianDeclarationAccepted, setGuardianDeclarationAccepted] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const selectedProcess = useMemo(
    () => processes.find((process) => process.alunoId === selectedAlunoId) || null,
    [processes, selectedAlunoId]
  );

  const setStepFromKey = useCallback(
    (value: PreRegistrationSessionDTO, step: PreRegistrationStep) => {
      const availableSteps = stepsForSession(value);
      const index = availableSteps.findIndex((candidate) => candidate.key === step);
      setActiveStep(Math.max(0, index));
    },
    []
  );

  const applySession = useCallback(
    (value: PreRegistrationSessionDTO) => {
      setSession(value);
      setSelectedAlunoId(value.alunoId);
      setPrivacyAccepted(false);
      setError('');
      setConflict(null);

      const availableSteps = stepsForSession(value);
      const draft = readDraft<FormData>(value.alunoId);
      const draftStepIsAvailable = Boolean(
        draft && availableSteps.some((step) => step.key === draft.step)
      );

      if (draft && draftStepIsAvailable && draft.baseVersion !== value.version) {
        setForm({ ...value.identity });
        setStepFromKey(value, value.currentStep);
        setConflict({
          serverSession: value,
          localDraft: draft,
          choices: buildConflictChoices(draft, value.identity),
        });
        setSavedMessage('');
        return;
      }

      const canRestoreDraft = Boolean(
        draft && draftStepIsAvailable && draft.baseVersion === value.version
      );
      setForm({
        ...value.identity,
        ...(canRestoreDraft ? draft!.form : {}),
      });
      setStepFromKey(value, canRestoreDraft ? (draft!.step as PreRegistrationStep) : value.currentStep);
      setSavedMessage(
        canRestoreDraft
          ? 'Restauramos os dados não sensíveis que ainda não haviam sido salvos nesta aba.'
          : ''
      );
    },
    [setStepFromKey]
  );

  const openProcess = useCallback(
    async (process: PreRegistrationProcessSummaryDTO) => {
      setSelectedAlunoId(process.alunoId);
      setSession(null);
      setConflict(null);
      setError('');
      setSavedMessage('');
      setGuardianRelationship(process.guardianAuthorizationRelationship || '');
      setGuardianDeclarationAccepted(false);
      if (process.requiresGuardianConfirmation) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        applySession(await preRegistrationPublicService.getSession(process.alunoId));
      } catch (reason) {
        setError(apiErrorMessage(reason));
      } finally {
        setLoading(false);
      }
    },
    [applySession]
  );

  const loadProcesses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const values = await preRegistrationPublicService.listProcesses();
      setProcesses(values);
      const preferredAlunoId = (location.state as { preferredAlunoId?: string } | null)
        ?.preferredAlunoId;
      const preferred = values.find((process) => process.alunoId === preferredAlunoId);
      const target = preferred || (values.length === 1 ? values[0] : undefined);
      if (target) {
        setSelectedAlunoId(target.alunoId);
        if (target.requiresGuardianConfirmation) {
          setSession(null);
        } else {
          applySession(await preRegistrationPublicService.getSession(target.alunoId));
        }
      } else {
        setSelectedAlunoId(null);
        setSession(null);
      }
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [applySession, location.state]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    void loadProcesses();
  }, [isAuthenticated, loadProcesses, navigate]);

  const visibleSteps = useMemo(() => (session ? stepsForSession(session) : STEPS), [session]);
  const currentStep =
    visibleSteps[Math.min(activeStep, visibleSteps.length - 1)] || visibleSteps[0];

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!loading && currentStep && session && !conflict) stepHeadingRef.current?.focus();
  }, [conflict, currentStep, loading, session]);

  useEffect(() => {
    if (!session || !currentStep || loading || conflict) return;
    writeDraft(
      { form, step: currentStep.key, baseVersion: session.version },
      session.alunoId
    );
  }, [conflict, form, currentStep, session, loading]);

  const setValue = (key: keyof FormData, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedMessage('');
  };

  const { cepError, formatZipCodeInput, handleZipCodeBlur } = useCepAutofill((address) => {
    setForm((current) => ({
      ...current,
      addressStreet: address.street,
      addressNeighborhood: address.neighborhood,
      addressCity: address.city,
      addressState: address.state,
    }));
  });

  const requestGuardianValidation = async () => {
    if (!selectedProcess) return;
    if (!guardianDeclarationAccepted || !guardianRelationship.trim()) {
      setError('Confirme a declaração e informe o vínculo com o menor.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const value = await preRegistrationPublicService.requestGuardianAuthorization(
        selectedProcess.alunoId,
        {
          relationship: guardianRelationship,
          declarationAccepted: true,
        }
      );
      setProcesses((current) =>
        current.map((process) =>
          process.alunoId === selectedProcess.alunoId
            ? {
                ...process,
                guardianAuthorizationStatus: value.status,
                guardianAuthorizationRelationship: value.relationship,
                guardianAuthorizationRequestedAt: value.requestedAt,
                requiresGuardianConfirmation: value.approvalRequired,
              }
            : process
        )
      );
      setGuardianDeclarationAccepted(false);
      setSavedMessage(
        value.approvalRequired
          ? 'Solicitação enviada. A academia precisa validar o vínculo antes de liberar os dados.'
          : 'O vínculo já está validado.'
      );
      if (!value.approvalRequired) {
        applySession(
          await preRegistrationPublicService.getSession(selectedProcess.alunoId)
        );
      }
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const validateCurrentStep = () => {
    if (!currentStep) return true;
    const missing: string[] = [];
    if (currentStep.key === 'IDENTIFICATION') {
      if (!form.name?.trim()) missing.push('nome completo');
      if (!form.birthDate) missing.push('data de nascimento');
      if (!form.cpf?.trim()) missing.push('CPF');
    }
    if (currentStep.key === 'CONTACT') {
      if (!form.phone?.trim()) missing.push('telefone principal');
      if (!form.email?.trim()) missing.push('e-mail principal');
    }
    if (currentStep.key === 'GUARDIAN') {
      if (!form.guardianName?.trim()) missing.push('nome do responsável');
      if (!form.guardianCpf?.trim()) missing.push('CPF do responsável');
    }
    if (missing.length === 0) return true;
    setError(`Preencha os campos obrigatórios desta etapa: ${missing.join(', ')}.`);
    return false;
  };

  const openConflictResolution = useCallback(
    async (reason: unknown, localDraft: PreRegistrationDraft<FormData>) => {
      const parsed = parseApiError(reason);
      if (parsed.code !== 'CONCURRENT_MODIFICATION' || !session) return false;
      const latest = await preRegistrationPublicService.getSession(session.alunoId);
      clearDraft(session.alunoId);
      setSession(latest);
      setForm({ ...latest.identity });
      setStepFromKey(latest, latest.currentStep);
      setConflict({
        serverSession: latest,
        localDraft,
        choices: buildConflictChoices(localDraft, latest.identity),
      });
      setPrivacyAccepted(false);
      setSavedMessage('');
      setError('');
      return true;
    },
    [session, setStepFromKey]
  );

  const saveCurrent = async (goForward: boolean) => {
    if (!session || !currentStep || conflict || !validateCurrentStep()) return;
    const localDraft: PreRegistrationDraft<FormData> = {
      form,
      step: currentStep.key,
      baseVersion: session.version,
    };
    setSaving(true);
    setError('');
    try {
      const next = await preRegistrationPublicService.saveStep(
        session.alunoId,
        buildSaveStepInput(session.version, currentStep.key, form)
      );
      setSession(next);
      setForm((current) => ({ ...current, ...next.identity }));
      setSavedMessage('Alterações salvas. Você pode continuar depois com a mesma conta.');
      clearDraft(session.alunoId);
      if (goForward) setActiveStep((index) => Math.min(index + 1, visibleSteps.length - 1));
    } catch (reason) {
      try {
        if (!(await openConflictResolution(reason, localDraft))) {
          setError(apiErrorMessage(reason));
        }
      } catch (refreshError) {
        setError(apiErrorMessage(refreshError));
      }
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!session || conflict) return;
    if (!privacyAccepted) {
      setError('Confirme que leu e aceitou o aviso de privacidade antes de concluir.');
      return;
    }
    const localDraft: PreRegistrationDraft<FormData> = {
      form,
      step: currentStep?.key || 'PRIVACY',
      baseVersion: session.version,
    };
    setSaving(true);
    setError('');
    try {
      const completed = await preRegistrationPublicService.complete(session.alunoId, {
        expectedVersion: session.version,
        privacyAccepted: true,
      });
      setSession(completed);
      clearDraft(session.alunoId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      try {
        if (!(await openConflictResolution(reason, localDraft))) {
          setError(apiErrorMessage(reason));
        }
      } catch (refreshError) {
        setError(apiErrorMessage(refreshError));
      }
    } finally {
      setSaving(false);
    }
  };

  const keepServerConflictValues = () => {
    if (!conflict) return;
    clearDraft(conflict.serverSession.alunoId);
    setSession(conflict.serverSession);
    setForm({ ...conflict.serverSession.identity });
    setStepFromKey(conflict.serverSession, conflict.serverSession.currentStep);
    setConflict(null);
    setSavedMessage('Dados atuais carregados. Você já pode continuar o preenchimento.');
  };

  const applyConflictChoices = () => {
    if (!conflict) return;
    const merged: FormData = { ...conflict.serverSession.identity };
    for (const { key } of CONFLICT_FIELD_DEFINITIONS) {
      if (conflict.choices[key] === 'LOCAL') {
        const value = conflict.localDraft.form[key];
        if (value !== undefined) {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
    }
    const targetStep = stepsForSession(conflict.serverSession).some(
      (step) => step.key === conflict.localDraft.step
    )
      ? (conflict.localDraft.step as PreRegistrationStep)
      : conflict.serverSession.currentStep;
    setSession(conflict.serverSession);
    setForm(merged);
    setStepFromKey(conflict.serverSession, targetStep);
    writeDraft(
      {
        form: merged,
        step: targetStep,
        baseVersion: conflict.serverSession.version,
      },
      conflict.serverSession.alunoId
    );
    setConflict(null);
    setSavedMessage(
      'Suas escolhas foram aplicadas sobre a versão atual. Revise e salve para confirmar.'
    );
  };

  if (loading) return <FullPageLoading text="Carregando seus pré-cadastros..." />;

  if (processes.length === 0) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Não foi possível abrir o pré-cadastro</h1>
          <p className="mt-2 text-slate-600">
            {error || 'Nenhum processo está vinculado a esta conta.'}
          </p>
          <button
            type="button"
            onClick={() => void loadProcesses()}
            className="mt-5 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            Tentar novamente
          </button>
        </div>
      </PublicShell>
    );
  }

  if (!selectedAlunoId) {
    return <ProcessSelector processes={processes} onSelect={(process) => void openProcess(process)} />;
  }

  if (selectedProcess?.requiresGuardianConfirmation) {
    const awaitingApproval = Boolean(selectedProcess.guardianAuthorizationRelationship);
    return (
      <PublicShell>
        <main className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <ShieldCheck className="h-11 w-11 text-blue-600" aria-hidden="true" />
          <p className="mt-5 text-sm font-medium text-blue-700">Acesso de responsável</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">
            {awaitingApproval ? 'Aguardando validação da academia' : 'Informe seu vínculo'}
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            {awaitingApproval
              ? 'Sua declaração foi registrada. Os dados pessoais do menor continuarão protegidos até que um usuário autorizado da academia valide o vínculo por uma fonte independente.'
              : 'Antes de solicitar acesso aos dados do menor, informe em qual qualidade você responde por este dependente. A declaração será enviada para validação da academia.'}
          </p>
          {error ? (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 outline-none"
            >
              {error}
            </div>
          ) : null}
          {savedMessage ? (
            <div
              role="status"
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            >
              {savedMessage}
            </div>
          ) : null}

          {awaitingApproval ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-semibold">Vínculo declarado: {selectedProcess.guardianAuthorizationRelationship}</p>
              <p className="mt-2 leading-6">
                A posse do convite e a declaração não concedem acesso por si só. Você poderá continuar quando a academia concluir a validação.
              </p>
              {selectedProcess.guardianAuthorizationRequestedAt ? (
                <p className="mt-3 text-xs text-amber-800">
                  Solicitação registrada em{' '}
                  {new Date(selectedProcess.guardianAuthorizationRequestedAt).toLocaleString('pt-BR')}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <Field
                label="Vínculo com o menor"
                name="guardianRelationship"
                value={guardianRelationship}
                required
                placeholder="Ex.: mãe, pai, tutor"
                onChange={setGuardianRelationship}
              />
              <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={guardianDeclarationAccepted}
                  onChange={(event) => setGuardianDeclarationAccepted(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  Declaro que sou responsável legal por este menor e que as informações fornecidas são verdadeiras. Estou ciente de que a academia validará o vínculo antes de liberar os dados.
                </span>
              </label>
            </div>
          )}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {processes.length > 1 ? (
              <button
                type="button"
                onClick={() => setSelectedAlunoId(null)}
                className="min-h-11 rounded-xl border border-slate-300 px-4 font-medium text-slate-700"
              >
                Escolher outro cadastro
              </button>
            ) : (
              <span />
            )}
            {awaitingApproval ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadProcesses()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Atualizar situação
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || !guardianDeclarationAccepted || !guardianRelationship.trim()}
                onClick={() => void requestGuardianValidation()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                Enviar para validação
              </button>
            )}
          </div>
        </main>
      </PublicShell>
    );
  }

  if (!session) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Não foi possível abrir o pré-cadastro</h1>
          <p className="mt-2 text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => selectedProcess && void openProcess(selectedProcess)}
            className="mt-5 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            Tentar novamente
          </button>
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
            <h1 className="mt-4 text-3xl font-semibold text-slate-950">
              Pré-cadastro concluído
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Seus dados foram enviados para revisão da {session.tenant.name}. Isso não significa
              liberação automática para treino.
            </p>
            {session.completedAt ? (
              <p className="mt-4 text-sm text-slate-500">
                Concluído em {new Date(session.completedAt).toLocaleString('pt-BR')}
              </p>
            ) : null}
            {processes.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedAlunoId(null);
                  setSession(null);
                }}
                className="mt-5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Escolher outro cadastro
              </button>
            ) : null}
          </section>
          <section aria-labelledby="next-steps-title">
            <h2 id="next-steps-title" className="text-xl font-semibold text-slate-950">
              Próximos passos opcionais
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {session.nextSteps.map((step) => (
                <article
                  key={step.key}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <HeartPulse className="h-7 w-7 text-blue-600" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Estado:{' '}
                    {step.status === 'NOT_STARTED'
                      ? 'Não iniciado'
                      : step.status === 'IN_PROGRESS'
                        ? 'Em andamento'
                        : 'Concluído'}
                  </p>
                  <a
                    href={step.href}
                    className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-blue-600 px-4 text-sm font-semibold text-blue-700"
                  >
                    {step.action === 'START'
                      ? 'Iniciar'
                      : step.action === 'CONTINUE'
                        ? 'Continuar'
                        : 'Consultar conclusão'}
                  </a>
                </article>
              ))}
            </div>
          </section>
        </main>
      </PublicShell>
    );
  }

  const missingFieldLabels = session.missingRequiredFields.map(
    (field) => REQUIRED_FIELD_LABELS[field] || field
  );

  return (
    <PublicShell>
      <main className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:self-start">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            {session.tenant.logoUrl ? (
              <img
                src={session.tenant.logoUrl}
                alt=""
                className="h-10 w-10 rounded-lg object-contain"
              />
            ) : (
              <HeartPulse className="h-9 w-9 text-blue-600" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Pré-matrícula</p>
              <p className="truncate font-semibold text-slate-950">{session.tenant.name}</p>
            </div>
          </div>
          {processes.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                setSelectedAlunoId(null);
                setSession(null);
                setConflict(null);
              }}
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Trocar cadastro
            </button>
          ) : null}
          <p className="mt-4 text-sm text-slate-600">
            Etapa {Math.min(activeStep + 1, visibleSteps.length)} de {visibleSteps.length}:{' '}
            <strong>{currentStep?.title}</strong>
          </p>
          <ol
            className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1"
            aria-label="Progresso do pré-cadastro"
          >
            {visibleSteps.map((step, index) => {
              const Icon = step.icon;
              const completed = index < activeStep;
              const active = index === activeStep;
              return (
                <li key={step.key}>
                  <button
                    type="button"
                    aria-label={`${step.title}: ${step.description}`}
                    aria-current={active ? 'step' : undefined}
                    disabled={Boolean(conflict)}
                    onClick={() => setActiveStep(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        completed
                          ? 'bg-emerald-100 text-emerald-700'
                          : active
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100'
                      }`}
                    >
                      {completed ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="hidden lg:block">
                      <span className="block font-medium">{step.title}</span>
                      <span className="block text-xs opacity-75">{step.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <header className="border-b border-slate-100 pb-5">
            <p className="text-sm font-medium text-blue-700">{currentStep?.description}</p>
            <h1
              ref={stepHeadingRef}
              tabIndex={-1}
              className="mt-1 text-2xl font-semibold text-slate-950 outline-none"
            >
              {currentStep?.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Preencha os campos abaixo. Salve para retomar com segurança em qualquer dispositivo.
            </p>
          </header>

          {error ? (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 outline-none"
            >
              <strong>Revise antes de continuar.</strong>
              <br />
              {error}
            </div>
          ) : null}
          {savedMessage ? (
            <div
              role="status"
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {savedMessage}
            </div>
          ) : null}
          {session.duplicateWarnings.length ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              A academia precisará revisar possíveis cadastros semelhantes por{' '}
              {session.duplicateWarnings.join(' e ')}. Seu rascunho foi preservado.
            </div>
          ) : null}

          {conflict ? (
            <ConflictResolutionPanel
              conflict={conflict}
              onChoiceChange={(field, choice) =>
                setConflict((current) =>
                  current
                    ? { ...current, choices: { ...current.choices, [field]: choice } }
                    : current
                )
              }
              onKeepServer={keepServerConflictValues}
              onApplyChoices={applyConflictChoices}
            />
          ) : (
            <>
              <div className="mt-6">
                {currentStep?.key === 'IDENTIFICATION' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field
                        label="Nome completo"
                        name="name"
                        value={form.name}
                        required
                        autoComplete="name"
                        onChange={(value) => setValue('name', value)}
                      />
                    </div>
                    <Field
                      label="Data de nascimento"
                      name="birthDate"
                      type="date"
                      value={form.birthDate?.slice(0, 10)}
                      required
                      autoComplete="bday"
                      onChange={(value) => setValue('birthDate', value)}
                    />
                    <Field
                      label="CPF"
                      name="cpf"
                      value={form.cpf}
                      required
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      onChange={(value) => setValue('cpf', value)}
                    />
                    <div className="block space-y-2 text-sm font-medium text-slate-800">
                      <label htmlFor="pre-registration-gender">Sexo/gênero</label>
                      <select
                        id="pre-registration-gender"
                        value={form.gender || ''}
                        onChange={(event) => setValue('gender', event.target.value)}
                        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                      >
                        <option value="">Selecione</option>
                        <option value="male">Masculino</option>
                        <option value="female">Feminino</option>
                        <option value="other">Outro</option>
                      </select>
                    </div>
                  </div>
                ) : null}

                {currentStep?.key === 'CONTACT' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Telefone principal"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      required
                      autoComplete="tel"
                      onChange={(value) => setValue('phone', value)}
                    />
                    <Field
                      label="E-mail principal"
                      name="email"
                      type="email"
                      value={form.email}
                      required
                      autoComplete="email"
                      onChange={(value) => setValue('email', value)}
                    />
                    <Field
                      label="Telefone alternativo"
                      name="additionalPhone"
                      type="tel"
                      value={form.additionalPhone}
                      autoComplete="tel"
                      onChange={(value) => setValue('additionalPhone', value)}
                    />
                    <Field
                      label="E-mail alternativo"
                      name="additionalEmail"
                      type="email"
                      value={form.additionalEmail}
                      autoComplete="email"
                      onChange={(value) => setValue('additionalEmail', value)}
                    />
                  </div>
                ) : null}

                {currentStep?.key === 'ADDRESS' ? (
                  <div className="grid gap-4 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <Field
                        label="CEP"
                        name="addressZipCode"
                        value={form.addressZipCode}
                        autoComplete="postal-code"
                        inputMode="numeric"
                        placeholder="00000-000"
                        error={cepError || undefined}
                        onChange={(value) =>
                          setValue('addressZipCode', formatZipCodeInput(value))
                        }
                        onBlur={handleZipCodeBlur}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Field
                        label="Rua"
                        name="addressStreet"
                        value={form.addressStreet}
                        autoComplete="address-line1"
                        onChange={(value) => setValue('addressStreet', value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Número"
                        name="addressNumber"
                        value={form.addressNumber}
                        autoComplete="address-line2"
                        onChange={(value) => setValue('addressNumber', value)}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Field
                        label="Complemento"
                        name="addressComplement"
                        value={form.addressComplement}
                        onChange={(value) => setValue('addressComplement', value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Bairro"
                        name="addressNeighborhood"
                        value={form.addressNeighborhood}
                        onChange={(value) => setValue('addressNeighborhood', value)}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Cidade"
                        name="addressCity"
                        value={form.addressCity}
                        autoComplete="address-level2"
                        onChange={(value) => setValue('addressCity', value)}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Field
                        label="UF"
                        name="addressState"
                        value={form.addressState}
                        autoComplete="address-level1"
                        onChange={(value) => setValue('addressState', value)}
                      />
                    </div>
                    <p className="sm:col-span-6 text-sm text-slate-500">
                      Caso o preenchimento automático por CEP esteja indisponível, informe o
                      endereço manualmente.
                    </p>
                  </div>
                ) : null}

                {currentStep?.key === 'GUARDIAN' ? (
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Nome do responsável legal"
                        name="guardianName"
                        value={form.guardianName}
                        required
                        onChange={(value) => setValue('guardianName', value)}
                      />
                      <Field
                        label="CPF do responsável"
                        name="guardianCpf"
                        value={form.guardianCpf}
                        required
                        inputMode="numeric"
                        onChange={(value) => setValue('guardianCpf', value)}
                      />
                      <Field
                        label="Telefone do responsável"
                        name="guardianPhone"
                        type="tel"
                        value={form.guardianPhone}
                        onChange={(value) => setValue('guardianPhone', value)}
                      />
                      <Field
                        label="E-mail do responsável"
                        name="guardianEmail"
                        type="email"
                        value={form.guardianEmail}
                        onChange={(value) => setValue('guardianEmail', value)}
                      />
                    </div>
                    {session.claimRole === 'STUDENT' &&
                    session.guardianAuthorization.status !== 'ACTIVE' ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                        Para concluir o cadastro de menor, a academia precisa vincular uma conta de
                        responsável legal. Os dados preenchidos podem ser salvos enquanto essa
                        validação é realizada.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {currentStep?.key === 'PRIVACY' ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <h2 className="font-semibold text-slate-950">Revise antes de concluir</h2>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-500">Nome</dt>
                          <dd className="font-medium text-slate-900">
                            {form.name || 'Pendente'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Nascimento</dt>
                          <dd className="font-medium text-slate-900">
                            {form.birthDate
                              ? new Date(
                                  `${form.birthDate.slice(0, 10)}T12:00:00`
                                ).toLocaleDateString('pt-BR')
                              : 'Pendente'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Telefone</dt>
                          <dd className="font-medium text-slate-900">
                            {form.phone || 'Pendente'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">E-mail</dt>
                          <dd className="font-medium text-slate-900">
                            {form.email || 'Pendente'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    {missingFieldLabels.length ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        Ainda existem campos obrigatórios pendentes:{' '}
                        {missingFieldLabels.join(', ')}.
                      </div>
                    ) : null}
                    <label
                      htmlFor="privacy-consent"
                      className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"
                    >
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
                      <span>
                        Li e aceito o{' '}
                        <a
                          href={session.privacy.noticeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold underline"
                        >
                          aviso de privacidade vigente
                        </a>
                        . O aceite registrará a versão {session.privacy.noticeVersion}, data, hora e
                        minha identidade autenticada.
                      </span>
                    </label>
                    <p className="text-sm text-slate-600">
                      A conclusão não ativa matrícula, contrato, cobrança, plano, agenda ou
                      liberação para treino.
                    </p>
                  </div>
                ) : null}
              </div>

              <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={activeStep === 0 || saving}
                  onClick={() => setActiveStep((index) => Math.max(0, index - 1))}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 font-medium text-slate-700 disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Voltar
                </button>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrent(false)}
                    className="min-h-11 rounded-xl border border-blue-600 px-4 font-semibold text-blue-700 disabled:opacity-50"
                  >
                    Salvar e continuar depois
                  </button>
                  {currentStep?.key === 'PRIVACY' ? (
                    <button
                      type="button"
                      disabled={saving || !privacyAccepted}
                      onClick={() => void complete()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      Concluir pré-cadastro
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveCurrent(true)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      )}
                      Salvar e avançar
                    </button>
                  )}
                </div>
              </footer>
            </>
          )}
        </section>
      </main>
    </PublicShell>
  );
}

export function PublicPreRegistration() {
  const { token } = useParams<{ token?: string }>();
  if (token === 'anamnese') return <OptionalModuleHandoff module="ANAMNESIS" />;
  if (token === 'par-q') return <OptionalModuleHandoff module="PARQ" />;
  return token ? <PublicLanding token={token} /> : <AuthenticatedFlow />;
}