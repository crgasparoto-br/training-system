import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import type {
  BankOption,
  CollaboratorFunctionOption,
  HourlyRateLevel,
  ProfessorSummary,
} from '@corrida/types';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { ExternalLink, Upload, X } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { resolveAssetUrl } from '../../utils/assetUrl';
import {
  formatCep,
  getCepLookupFeedbackMessage,
  lookupCep,
  onlyCepDigits,
} from '../../services/cep.service';
import {
  formatCollaboratorBankAccount,
  formatCollaboratorCompanyDocument,
  formatCollaboratorCpf,
  formatCollaboratorPhone,
  formatCollaboratorRg,
  normalizeCollaboratorInstagram,
} from './collaborator-formatters';
import type { CollaboratorFormValues } from './collaborator-model';
import { CollaboratorBankSearch } from './CollaboratorBankSearch';
import { CollaboratorHourlyRates } from './CollaboratorHourlyRates';
import { CollaboratorSection } from './CollaboratorSection';

const selectClassName =
  'flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted';
const textareaClassName =
  'min-h-[110px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted';

function errorMessage(error: unknown) {
  return typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
    ? error.message
    : undefined;
}

function SelectField({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      <select className={selectClassName} {...props}>
        {children}
      </select>
      {error ? <span className="block text-sm text-destructive">{error}</span> : null}
    </label>
  );
}

export function CollaboratorForm({
  mode,
  register,
  errors,
  watch,
  setValue,
  collaboratorFunctions,
  managers,
  banks,
  hourlyRateLevels,
  showCollaboratorBlock,
  showManagerBlock,
  administrativeFieldsEnabled,
  signedContractUploadEnabled,
  uploadingAvatar,
  uploadingContract,
  onAvatarFile,
  onContractFile,
  onCancel,
  submitting,
}: {
  mode: 'create' | 'edit';
  register: UseFormRegister<CollaboratorFormValues>;
  errors: FieldErrors<CollaboratorFormValues>;
  watch: UseFormWatch<CollaboratorFormValues>;
  setValue: UseFormSetValue<CollaboratorFormValues>;
  collaboratorFunctions: CollaboratorFunctionOption[];
  managers: ProfessorSummary[];
  banks: BankOption[];
  hourlyRateLevels: HourlyRateLevel[];
  showCollaboratorBlock: boolean;
  showManagerBlock: boolean;
  administrativeFieldsEnabled: boolean;
  signedContractUploadEnabled: boolean;
  uploadingAvatar: boolean;
  uploadingContract: boolean;
  onAvatarFile: (file: File) => void;
  onContractFile: (file: File) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [cepError, setCepError] = useState<string | null>(null);
  const avatar = watch('avatar');
  const hasSignedContract = watch('hasSignedContract');
  const signedContractDocumentUrl = watch('signedContractDocumentUrl');
  const currentStatus = watch('currentStatus');
  const dismissalDate = watch('dismissalDate');
  const collaboratorFunctionId = watch('collaboratorFunctionId');
  const operationalRoleIds = watch('operationalRoleIds') ?? [];
  const bankCode = watch('bankCode') ?? '';
  const selectedFunction = collaboratorFunctions.find((item) => item.id === collaboratorFunctionId);
  const showResponsibleManager = selectedFunction?.code !== 'manager';
  const avatarUrl = resolveAssetUrl(avatar);
  const zipCodeField = register('addressZipCode');

  useEffect(() => {
    if (!hasSignedContract && signedContractDocumentUrl) {
      setValue('signedContractDocumentUrl', '', { shouldDirty: true, shouldValidate: true });
    }
  }, [hasSignedContract, setValue, signedContractDocumentUrl]);

  useEffect(() => {
    if (currentStatus !== 'Desligado' && dismissalDate) {
      setValue('dismissalDate', '', { shouldDirty: true, shouldValidate: true });
    }
  }, [currentStatus, dismissalDate, setValue]);

  const toggleOperationalRole = (roleId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...operationalRoleIds, roleId]))
      : operationalRoleIds.filter((id) => id !== roleId);
    setValue('operationalRoleIds', next, { shouldDirty: true, shouldValidate: true });
  };

  const handleZipCodeBlur = async (event: React.FocusEvent<HTMLInputElement>) => {
    zipCodeField.onBlur(event);
    const cep = onlyCepDigits(event.target.value);
    if (cep.length < 8) return;

    setCepError(null);
    try {
      const address = await lookupCep(cep);
      if (!address) return;
      setValue('addressStreet', address.street, { shouldDirty: true, shouldValidate: true });
      setValue('addressNeighborhood', address.neighborhood, { shouldDirty: true, shouldValidate: true });
      setValue('addressCity', address.city, { shouldDirty: true, shouldValidate: true });
      setValue('addressState', address.state, { shouldDirty: true, shouldValidate: true });
      if (address.complement) {
        setValue('addressComplement', address.complement, { shouldDirty: true, shouldValidate: true });
      }
    } catch (error) {
      setCepError(getCepLookupFeedbackMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      {showCollaboratorBlock ? (
        <>
          <CollaboratorSection title="Identificação e contato" description="Dados usados para identificar e contatar o colaborador.">
            <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-card">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Foto do colaborador" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-muted-foreground">Sem foto</span>
                  )}
                </div>
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                  <Upload size={16} />
                  {uploadingAvatar ? 'Enviando...' : 'Enviar foto'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploadingAvatar}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onAvatarFile(file);
                      event.target.value = '';
                    }}
                  />
                </label>
                {avatar ? (
                  <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => setValue('avatar', '', { shouldDirty: true, shouldValidate: true })}>
                    <X size={16} /> Remover foto
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Nome" required {...register('name')} error={errorMessage(errors.name)} />
                <Input label="E-mail" type="email" required {...register('email')} error={errorMessage(errors.email)} />
                <Input
                  label={mode === 'create' ? 'Senha inicial' : 'Nova senha (opcional)'}
                  type="password"
                  required={mode === 'create'}
                  {...register('password')}
                  error={errorMessage(errors.password)}
                />
                <Input
                  label="Telefone"
                  {...register('phone')}
                  onChange={(event) => setValue('phone', formatCollaboratorPhone(event.target.value), { shouldDirty: true, shouldValidate: true })}
                  error={errorMessage(errors.phone)}
                />
                <Input label="Data de nascimento" type="date" {...register('birthDate')} error={errorMessage(errors.birthDate)} />
                <Input
                  label="CPF"
                  {...register('cpf')}
                  onChange={(event) => setValue('cpf', formatCollaboratorCpf(event.target.value), { shouldDirty: true, shouldValidate: true })}
                  error={errorMessage(errors.cpf)}
                />
                <Input
                  label="RG"
                  {...register('rg')}
                  onChange={(event) => setValue('rg', formatCollaboratorRg(event.target.value), { shouldDirty: true, shouldValidate: true })}
                  error={errorMessage(errors.rg)}
                />
                <SelectField label="Estado civil" {...register('maritalStatus')} error={errorMessage(errors.maritalStatus)}>
                  <option value="">Selecionar depois</option>
                  <option value="single">Solteiro(a)</option>
                  <option value="married">Casado(a)</option>
                  <option value="stable_union">União estável</option>
                  <option value="divorced">Divorciado(a)</option>
                  <option value="separated">Separado(a)</option>
                  <option value="widowed">Viúvo(a)</option>
                  <option value="other">Outro</option>
                </SelectField>
              </div>
            </div>
          </CollaboratorSection>

          <CollaboratorSection title="Endereço" description="Informações para cadastro e documentos.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Input
                label="CEP"
                {...zipCodeField}
                onChange={(event) => {
                  setCepError(null);
                  setValue('addressZipCode', formatCep(event.target.value), { shouldDirty: true, shouldValidate: true });
                }}
                onBlur={(event) => void handleZipCodeBlur(event)}
                error={cepError ?? errorMessage(errors.addressZipCode)}
              />
              <Input label="Logradouro" {...register('addressStreet')} error={errorMessage(errors.addressStreet)} />
              <Input label="Número" {...register('addressNumber')} error={errorMessage(errors.addressNumber)} />
              <Input label="Bairro" {...register('addressNeighborhood')} error={errorMessage(errors.addressNeighborhood)} />
              <Input label="Cidade" {...register('addressCity')} error={errorMessage(errors.addressCity)} />
              <Input
                label="Estado"
                maxLength={2}
                {...register('addressState')}
                onChange={(event) => setValue('addressState', event.target.value.toUpperCase().slice(0, 2), { shouldDirty: true, shouldValidate: true })}
                error={errorMessage(errors.addressState)}
              />
              <div className="md:col-span-2 xl:col-span-3">
                <Input label="Complemento" {...register('addressComplement')} error={errorMessage(errors.addressComplement)} />
              </div>
            </div>
          </CollaboratorSection>

          <CollaboratorSection title="Perfil profissional" description="Experiência, registro e apresentação profissional.">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Instagram"
                {...register('instagramHandle')}
                onBlur={(event) => setValue('instagramHandle', normalizeCollaboratorInstagram(event.target.value), { shouldDirty: true, shouldValidate: true })}
                error={errorMessage(errors.instagramHandle)}
              />
              <Input label="CREF" {...register('cref')} error={errorMessage(errors.cref)} />
              <Input label="Currículo Lattes" type="url" {...register('lattesUrl')} error={errorMessage(errors.lattesUrl)} />
              <div className="md:col-span-2">
                <label className="block space-y-2 text-sm font-medium text-foreground">
                  <span>Resumo profissional</span>
                  <textarea className={textareaClassName} {...register('professionalSummary')} />
                  {errorMessage(errors.professionalSummary) ? <span className="block text-sm text-destructive">{errorMessage(errors.professionalSummary)}</span> : null}
                </label>
              </div>
            </div>
          </CollaboratorSection>

          <CollaboratorSection title="Dados jurídicos e financeiros" description="Dados para contratação e pagamento.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Input
                label="CNPJ / documento da empresa"
                {...register('companyDocument')}
                onChange={(event) => setValue('companyDocument', formatCollaboratorCompanyDocument(event.target.value), { shouldDirty: true, shouldValidate: true })}
                error={errorMessage(errors.companyDocument)}
              />
              <input type="hidden" {...register('bankCode')} />
              <CollaboratorBankSearch
                banks={banks}
                value={bankCode}
                onChange={(nextBankCode) => setValue('bankCode', nextBankCode, { shouldDirty: true, shouldValidate: true })}
                error={errorMessage(errors.bankCode)}
              />
              <Input label="Agência" {...register('bankBranch')} error={errorMessage(errors.bankBranch)} />
              <Input
                label="Conta"
                {...register('bankAccount')}
                onChange={(event) => setValue('bankAccount', formatCollaboratorBankAccount(event.target.value), { shouldDirty: true, shouldValidate: true })}
                error={errorMessage(errors.bankAccount)}
              />
              <Input label="Chave Pix" {...register('pixKey')} error={errorMessage(errors.pixKey)} />
            </div>
          </CollaboratorSection>
        </>
      ) : null}

      {showManagerBlock ? (
        <>
          <CollaboratorSection title="Vínculo operacional" description="Função, gestão responsável, situação e frentes de atuação.">
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Função principal"
                disabled={!administrativeFieldsEnabled}
                {...register('collaboratorFunctionId')}
                error={errorMessage(errors.collaboratorFunctionId)}
              >
                <option value="">Selecione uma função</option>
                {collaboratorFunctions.filter((item) => item.isActive || item.id === collaboratorFunctionId).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </SelectField>
              {showResponsibleManager ? (
                <SelectField
                  label="Gestor responsável"
                  disabled={!administrativeFieldsEnabled}
                  {...register('responsibleManagerId')}
                  error={errorMessage(errors.responsibleManagerId)}
                >
                  <option value="">Selecione um gestor</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>{manager.user.profile.name}</option>
                  ))}
                </SelectField>
              ) : null}
              <Input label="Data de admissão" type="date" disabled={!administrativeFieldsEnabled} {...register('admissionDate')} error={errorMessage(errors.admissionDate)} />
              <SelectField label="Situação atual" disabled={!administrativeFieldsEnabled} {...register('currentStatus')} error={errorMessage(errors.currentStatus)}>
                <option value="">Selecionar depois</option>
                <option value="Ativo">Ativo</option>
                <option value="Desligado">Desligado</option>
              </SelectField>
              <Input
                label="Data de desligamento"
                type="date"
                disabled={!administrativeFieldsEnabled || currentStatus !== 'Desligado'}
                {...register('dismissalDate')}
                error={errorMessage(errors.dismissalDate)}
              />
            </div>

            <div className="mt-5 rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-foreground">Funções operacionais</p>
              <p className="mt-1 text-xs text-muted-foreground">Defina as frentes em que este colaborador pode atuar.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {collaboratorFunctions.filter((item) => item.isActive).map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={operationalRoleIds.includes(item.id)}
                      disabled={!administrativeFieldsEnabled}
                      onChange={(event) => toggleOperationalRole(item.id, event.target.checked)}
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            </div>
          </CollaboratorSection>

          <CollaboratorSection title="Remuneração" description="Valores por frente de atuação e nível calculado pelas faixas configuradas.">
            <CollaboratorHourlyRates
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
              levels={hourlyRateLevels}
              disabled={!administrativeFieldsEnabled}
            />
          </CollaboratorSection>

          <CollaboratorSection title="Contrato legado" description="Este bloco permanece disponível até a migração para o ciclo contratual da issue #263.">
            <label className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm font-medium text-foreground">
              <input type="checkbox" disabled={!administrativeFieldsEnabled} {...register('hasSignedContract')} />
              O colaborador possui contrato assinado
            </label>

            {hasSignedContract ? (
              <div className="mt-4 rounded-xl border border-dashed border-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{signedContractDocumentUrl ? 'PDF anexado' : 'Nenhum PDF enviado'}</p>
                    {signedContractDocumentUrl ? (
                      <a href={signedContractDocumentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        Visualizar contrato <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                  {signedContractUploadEnabled ? (
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                      <Upload size={16} />
                      {uploadingContract ? 'Enviando...' : signedContractDocumentUrl ? 'Substituir PDF' : 'Enviar PDF'}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        disabled={uploadingContract}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onContractFile(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}
                </div>
                {errorMessage(errors.signedContractDocumentUrl) ? <p className="mt-2 text-sm text-destructive">{errorMessage(errors.signedContractDocumentUrl)}</p> : null}
              </div>
            ) : null}
          </CollaboratorSection>
        </>
      ) : null}

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="submit" disabled={submitting || uploadingAvatar || uploadingContract}>
          {submitting ? 'Salvando...' : mode === 'create' ? 'Cadastrar colaborador' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  );
}
