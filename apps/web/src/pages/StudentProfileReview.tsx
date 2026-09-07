import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Clock3, Info } from 'lucide-react';
import { buttonClassName, Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import {
  getStudentContractId,
  getStudentSelfServiceErrorKind,
  STUDENT_HOME_ROUTE,
  studentSelfService,
  type StudentMaritalStatus,
  type StudentProfileReview as StudentProfileReviewData,
  type StudentProfileReviewChanges,
  type StudentSelfProfile,
  type StudentSelfServiceErrorKind,
  withStudentContractContext,
} from '../services/student-self.service';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; review: StudentProfileReviewData | null; profile: StudentSelfProfile | null }
  | { status: 'failed'; kind: StudentSelfServiceErrorKind };

type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting'; mode: 'no-changes' | 'changes' }
  | { status: 'success'; hasPendingApproval: boolean }
  | { status: 'unavailable' }
  | { status: 'failed'; message: string };

type ReviewSection =
  | 'personal'
  | 'contact'
  | 'address'
  | 'preferences'
  | 'health'
  | 'anamnesis'
  | 'other';

type FormValues = {
  phone: string;
  birthDate: string;
  maritalStatus: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  instagramHandle: string;
  mainGoal: string;
  trainingBackground: string;
  observations: string;
};

const DEFAULT_SECTIONS: ReviewSection[] = [
  'personal',
  'contact',
  'address',
  'preferences',
  'health',
  'anamnesis',
];

const SECTION_LABELS: Record<ReviewSection, string> = {
  personal: 'Dados pessoais',
  contact: 'Contato',
  address: 'Endereço',
  preferences: 'Objetivos e preferências',
  health: 'Dados físicos',
  anamnesis: 'Histórico e observações',
  other: 'Outras informações',
};

const MARITAL_STATUS_OPTIONS: Array<{ value: StudentMaritalStatus; label: string }> = [
  { value: 'single', label: 'Solteiro(a)' },
  { value: 'married', label: 'Casado(a)' },
  { value: 'stable_union', label: 'União estável' },
  { value: 'divorced', label: 'Divorciado(a)' },
  { value: 'separated', label: 'Separado(a)' },
  { value: 'widowed', label: 'Viúvo(a)' },
  { value: 'other', label: 'Outro' },
];

const textAreaClassName =
  'min-h-28 w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground';

const selectClassName =
  'flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground';

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function genderLabel(value?: StudentSelfProfile['profile']['gender']) {
  if (value === 'male') return 'Masculino';
  if (value === 'female') return 'Feminino';
  if (value === 'other') return 'Outro';
  return 'Não informado';
}

function physicalValue(value: number | null | undefined, suffix: string) {
  return value == null ? 'Não informado' : `${value}${suffix}`;
}

function toFormValues(profile: StudentSelfProfile): FormValues {
  return {
    phone: profile.profile.phone ?? '',
    birthDate: toDateInputValue(profile.profile.birthDate),
    maritalStatus: profile.profile.maritalStatus ?? '',
    addressStreet: profile.profile.addressStreet ?? '',
    addressNumber: profile.profile.addressNumber ?? '',
    addressComplement: profile.profile.addressComplement ?? '',
    addressNeighborhood: profile.profile.addressNeighborhood ?? '',
    addressCity: profile.profile.addressCity ?? '',
    addressState: profile.profile.addressState ?? '',
    addressZipCode: profile.profile.addressZipCode ?? '',
    instagramHandle: profile.profile.instagramHandle ?? '',
    mainGoal: profile.intakeForm?.mainGoal ?? '',
    trainingBackground: profile.intakeForm?.trainingBackground ?? '',
    observations: profile.intakeForm?.observations ?? '',
  };
}

function normalizeSections(value: unknown): ReviewSection[] {
  if (!Array.isArray(value)) return DEFAULT_SECTIONS;

  const sections = value.filter(
    (item): item is ReviewSection =>
      typeof item === 'string' && Object.prototype.hasOwnProperty.call(SECTION_LABELS, item)
  );

  return sections.length > 0 ? Array.from(new Set(sections)) : DEFAULT_SECTIONS;
}

function toNullableString(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildChanges(initial: FormValues, current: FormValues): StudentProfileReviewChanges {
  const changes: StudentProfileReviewChanges = {};
  const profile: NonNullable<StudentProfileReviewChanges['profile']> = {};
  const intakeForm: NonNullable<StudentProfileReviewChanges['intakeForm']> = {};

  if (current.phone !== initial.phone) profile.phone = toNullableString(current.phone);
  if (current.birthDate !== initial.birthDate) profile.birthDate = current.birthDate || null;
  if (current.maritalStatus !== initial.maritalStatus) {
    profile.maritalStatus = (current.maritalStatus || null) as StudentMaritalStatus | null;
  }
  if (current.addressStreet !== initial.addressStreet) {
    profile.addressStreet = toNullableString(current.addressStreet);
  }
  if (current.addressNumber !== initial.addressNumber) {
    profile.addressNumber = toNullableString(current.addressNumber);
  }
  if (current.addressComplement !== initial.addressComplement) {
    profile.addressComplement = toNullableString(current.addressComplement);
  }
  if (current.addressNeighborhood !== initial.addressNeighborhood) {
    profile.addressNeighborhood = toNullableString(current.addressNeighborhood);
  }
  if (current.addressCity !== initial.addressCity) {
    profile.addressCity = toNullableString(current.addressCity);
  }
  if (current.addressState !== initial.addressState) {
    profile.addressState = toNullableString(current.addressState)?.toUpperCase() ?? null;
  }
  if (current.addressZipCode !== initial.addressZipCode) {
    profile.addressZipCode = toNullableString(current.addressZipCode);
  }
  if (current.instagramHandle !== initial.instagramHandle) {
    profile.instagramHandle = toNullableString(current.instagramHandle);
  }
  if (current.mainGoal !== initial.mainGoal) {
    intakeForm.mainGoal = toNullableString(current.mainGoal);
  }
  if (current.trainingBackground !== initial.trainingBackground) {
    intakeForm.trainingBackground = toNullableString(current.trainingBackground);
  }
  if (current.observations !== initial.observations) {
    intakeForm.observations = toNullableString(current.observations);
  }

  if (Object.keys(profile).length > 0) changes.profile = profile;
  if (Object.keys(intakeForm).length > 0) changes.intakeForm = intakeForm;
  return changes;
}

function hasChanges(changes: StudentProfileReviewChanges) {
  return Object.values(changes).some(
    (group) => group && typeof group === 'object' && Object.keys(group).length > 0
  );
}

function getApiMessage(error: unknown) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim()
    ? message
    : 'Não foi possível concluir a revisão. Confira os dados e tente novamente.';
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

function SectionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function StudentProfileReview() {
  const location = useLocation();
  const contractId = getStudentContractId(location.search);
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [formValues, setFormValues] = useState<FormValues | null>(null);
  const [initialValues, setInitialValues] = useState<FormValues | null>(null);
  const [completion, setCompletion] = useState<CompletionState>({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setCompletion({ status: 'idle' });
    try {
      const review = await studentSelfService.getProfileReview(contractId);
      if (!review) {
        setState({ status: 'ready', review: null, profile: null });
        setFormValues(null);
        setInitialValues(null);
        return;
      }

      const profile = await studentSelfService.getProfile(contractId);
      const values = toFormValues(profile);
      setInitialValues(values);
      setFormValues(values);
      setState({ status: 'ready', review, profile });
    } catch (error) {
      setState({ status: 'failed', kind: getStudentSelfServiceErrorKind(error) });
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const homeDestination = withStudentContractContext(STUDENT_HOME_ROUTE, contractId);
  const review = state.status === 'ready' ? state.review : null;
  const profile = state.status === 'ready' ? state.profile : null;
  const requestedSections = useMemo(
    () => normalizeSections(review?.sectionsRequested),
    [review?.sectionsRequested]
  );
  const changes = useMemo(
    () => (initialValues && formValues ? buildChanges(initialValues, formValues) : {}),
    [formValues, initialValues]
  );
  const dirty = hasChanges(changes);
  const isSubmitting = completion.status === 'submitting';

  const updateField = (field: keyof FormValues, value: string) => {
    setCompletion((current) => (current.status === 'failed' ? { status: 'idle' } : current));
    setFormValues((current) => (current ? { ...current, [field]: value } : current));
  };

  const submit = async (
    mode: 'no-changes' | 'changes',
    payload: { noChanges: true } | { changes: StudentProfileReviewChanges }
  ) => {
    if (!review || isSubmitting) return;

    setCompletion({ status: 'submitting', mode });
    try {
      const result = await studentSelfService.completeProfileReview(review.id, payload, contractId);
      setCompletion({
        status: 'success',
        hasPendingApproval: result.approval?.hasPendingApproval === true,
      });
    } catch (error) {
      try {
        const pending = await studentSelfService.getProfileReview(contractId);
        if (!pending || pending.id !== review.id) {
          setCompletion({ status: 'unavailable' });
          return;
        }
      } catch {
        // A falha de revalidação não pode transformar um erro de envio em sucesso presumido.
      }
      setCompletion({ status: 'failed', message: getApiMessage(error) });
    }
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty) return;
    void submit('changes', { changes });
  };

  if (completion.status === 'success') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Card aria-live="polite">
          <CardHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <CardTitle>Revisão concluída</CardTitle>
                <CardDescription>
                  {completion.hasPendingApproval
                    ? 'Recebemos suas alterações. Alguns dados serão analisados pelo profissional antes de serem atualizados.'
                    : 'Sua revisão cadastral foi concluída com sucesso.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to={homeDestination} className={buttonClassName()}>
              Voltar para início
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-8">
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
            Confira os dados solicitados, corrija somente o que mudou e conclua a revisão.
          </p>
        </div>
      </div>

      {state.status === 'loading' ? (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>Carregando revisão</CardTitle>
            <CardDescription>Consultando a revisão e os dados vinculados à sua conta...</CardDescription>
          </CardHeader>
        </Card>
      ) : state.status === 'failed' ? (
        <ErrorState kind={state.kind} onRetry={load} />
      ) : review && profile && formValues ? (
        <form className="space-y-6" onSubmit={handleSave}>
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Revisão pendente</CardTitle>
                    <span className="ts-badge-warning">Ação necessária</span>
                  </div>
                  <CardDescription>
                    Revise as seções abaixo. Campos sem edição nesta tela servem apenas para conferência.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <ReadOnlyValue label="Solicitada em" value={formatDate(review.requestedAt) ?? 'Data não informada'} />
                <ReadOnlyValue label="Prazo" value={formatDate(review.dueAt) ?? 'Sem prazo definido'} />
              </dl>
              <div className="rounded-lg border border-info/30 bg-info/5 p-4 text-sm text-foreground">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Seções solicitadas</p>
                    <p className="mt-1 text-muted-foreground">
                      {requestedSections.map((section) => SECTION_LABELS[section]).join(', ')}.
                    </p>
                  </div>
                </div>
              </div>
              {review.dueAt && new Date(review.dueAt).getTime() < Date.now() && (
                <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm" role="status">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>O prazo informado já passou. Você ainda pode tentar concluir enquanto a revisão permanecer disponível.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {requestedSections.includes('personal') && (
            <SectionCard
              title="Dados pessoais"
              description="Confira sua identificação. Alguns dados podem precisar de análise antes de serem atualizados."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Nome" value={profile.profile.name} disabled />
                <Input label="E-mail" value={profile.email} disabled />
                <Input
                  label="Data de nascimento"
                  type="date"
                  value={formValues.birthDate}
                  onChange={(event) => updateField('birthDate', event.target.value)}
                />
                <div className="w-full">
                  <label htmlFor="profile-review-marital-status" className="mb-2 block text-sm font-medium text-foreground">
                    Estado civil
                  </label>
                  <select
                    id="profile-review-marital-status"
                    className={selectClassName}
                    value={formValues.maritalStatus}
                    onChange={(event) => updateField('maritalStatus', event.target.value)}
                  >
                    <option value="">Não informado</option>
                    {MARITAL_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <ReadOnlyValue label="Sexo" value={genderLabel(profile.profile.gender)} />
                </div>
              </div>
            </SectionCard>
          )}

          {requestedSections.includes('contact') && (
            <SectionCard title="Contato" description="Atualize seus canais de contato se tiverem mudado.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Telefone"
                  value={formValues.phone}
                  maxLength={30}
                  onChange={(event) => updateField('phone', event.target.value)}
                />
                <Input
                  label="Instagram"
                  value={formValues.instagramHandle}
                  maxLength={60}
                  placeholder="@seu_usuario"
                  onChange={(event) => updateField('instagramHandle', event.target.value)}
                />
              </div>
            </SectionCard>
          )}

          {requestedSections.includes('address') && (
            <SectionCard title="Endereço" description="Confira o endereço cadastrado e corrija apenas o que estiver diferente.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label="Rua"
                    value={formValues.addressStreet}
                    maxLength={120}
                    onChange={(event) => updateField('addressStreet', event.target.value)}
                  />
                </div>
                <Input label="Número" value={formValues.addressNumber} maxLength={20} onChange={(event) => updateField('addressNumber', event.target.value)} />
                <Input label="Complemento" value={formValues.addressComplement} maxLength={120} onChange={(event) => updateField('addressComplement', event.target.value)} />
                <Input label="Bairro" value={formValues.addressNeighborhood} maxLength={120} onChange={(event) => updateField('addressNeighborhood', event.target.value)} />
                <Input label="Cidade" value={formValues.addressCity} maxLength={120} onChange={(event) => updateField('addressCity', event.target.value)} />
                <Input label="Estado" value={formValues.addressState} maxLength={2} placeholder="SP" onChange={(event) => updateField('addressState', event.target.value)} />
                <Input label="CEP" value={formValues.addressZipCode} maxLength={20} onChange={(event) => updateField('addressZipCode', event.target.value)} />
              </div>
            </SectionCard>
          )}

          {requestedSections.includes('preferences') && (
            <SectionCard title="Objetivos e preferências" description="Atualize seu objetivo principal se ele tiver mudado.">
              <div className="w-full">
                <label htmlFor="profile-review-main-goal" className="mb-2 block text-sm font-medium text-foreground">
                  Objetivo principal
                </label>
                <textarea id="profile-review-main-goal" className={textAreaClassName} value={formValues.mainGoal} maxLength={500} onChange={(event) => updateField('mainGoal', event.target.value)} />
              </div>
            </SectionCard>
          )}

          {requestedSections.includes('health') && (
            <SectionCard title="Dados físicos" description="Estes dados estão disponíveis para conferência nesta revisão.">
              <dl className="grid gap-3 sm:grid-cols-3">
                <ReadOnlyValue label="Idade" value={physicalValue(profile.physical.age, ' anos')} />
                <ReadOnlyValue label="Peso" value={physicalValue(profile.physical.weight, ' kg')} />
                <ReadOnlyValue label="Altura" value={physicalValue(profile.physical.height, ' cm')} />
              </dl>
            </SectionCard>
          )}

          {requestedSections.includes('anamnesis') && (
            <SectionCard title="Histórico e observações" description="Revise as informações de contexto atualmente disponíveis para você.">
              <div className="space-y-4">
                <ReadOnlyValue label="Data de referência" value={formatDate(profile.intakeForm?.assessmentDate) ?? 'Não informada'} />
                <div className="w-full">
                  <label htmlFor="profile-review-training-background" className="mb-2 block text-sm font-medium text-foreground">
                    Histórico de treino
                  </label>
                  <textarea id="profile-review-training-background" className={textAreaClassName} value={formValues.trainingBackground} maxLength={3000} onChange={(event) => updateField('trainingBackground', event.target.value)} />
                </div>
                <div className="w-full">
                  <label htmlFor="profile-review-observations" className="mb-2 block text-sm font-medium text-foreground">
                    Observações
                  </label>
                  <textarea id="profile-review-observations" className={textAreaClassName} value={formValues.observations} maxLength={3000} onChange={(event) => updateField('observations', event.target.value)} />
                </div>
              </div>
            </SectionCard>
          )}

          {requestedSections.includes('other') && (
            <SectionCard title="Outras informações" description="Esta solicitação inclui uma seção adicional.">
              <p className="text-sm text-muted-foreground">
                Não há campos adicionais disponíveis para edição nesta tela. Confira as demais seções e conclua a revisão; se precisar atualizar outra informação, entre em contato com seu profissional.
              </p>
            </SectionCard>
          )}

          {completion.status === 'unavailable' && (
            <Card aria-live="polite">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                  <div>
                    <CardTitle>Esta revisão não está mais disponível</CardTitle>
                    <CardDescription>
                      Ela pode ter sido concluída ou encerrada em outra tentativa. Atualize a tela ou volte ao início para consultar o estado atual.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={load}>Atualizar revisão</Button>
                <Link to={homeDestination} className={buttonClassName({ variant: 'ghost' })}>Voltar para início</Link>
              </CardContent>
            </Card>
          )}

          {completion.status === 'failed' && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
              <p className="font-medium">Não foi possível concluir a revisão.</p>
              <p className="mt-1 text-muted-foreground">{completion.message}</p>
            </div>
          )}

          {completion.status !== 'unavailable' && (
            <Card>
              <CardHeader>
                <CardTitle>Concluir revisão</CardTitle>
                <CardDescription>
                  Escolha uma das opções abaixo. O envio só será considerado concluído depois da resposta do sistema.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={dirty || isSubmitting}
                  isLoading={completion.status === 'submitting' && completion.mode === 'no-changes'}
                  loadingText="Enviando..."
                  onClick={() => void submit('no-changes', { noChanges: true })}
                  className="w-full sm:w-auto"
                >
                  Concluir sem alterações
                </Button>
                <Button
                  type="submit"
                  disabled={!dirty || isSubmitting}
                  isLoading={completion.status === 'submitting' && completion.mode === 'changes'}
                  loadingText="Enviando..."
                  className="w-full sm:w-auto"
                >
                  Salvar alterações e concluir
                </Button>
              </CardContent>
            </Card>
          )}
        </form>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <CardTitle>Nenhuma revisão cadastral pendente</CardTitle>
                <CardDescription>
                  Não há nenhuma solicitação aberta para este vínculo no momento. Se você já enviou uma revisão, o resultado pode ter sido registrado em outra tentativa.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
