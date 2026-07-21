import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type {
  BankOption,
  CollaboratorFunctionOption,
  HourlyRateLevel,
  ProfessorSummary,
} from '@corrida/types';
import { ArrowLeft } from 'lucide-react';
import { professorService } from '../services/professor.service';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { hourlyRateLevelService } from '../services/hourly-rate-level.service';
import { bankService } from '../services/bank.service';
import { useAuthStore } from '../stores/useAuthStore';
import { canAccessBlock, getDataScopeForScreen } from '../access/access-control';
import { Button } from '../components/ui/Button';
import { CollaboratorAdministrativeActions } from '../features/collaborators/CollaboratorAdministrativeActions';
import { CollaboratorForm } from '../features/collaborators/CollaboratorForm';
import { canCreateCollaborator, canWriteCollaborator, isSelfCollaborator } from '../features/collaborators/collaborator-access';
import {
  collaboratorFormSchema,
  createCollaboratorFormValues,
  toCreateProfessorRequest,
  toSelfServiceUpdateProfessorRequest,
  toUpdateProfessorRequest,
  type CollaboratorFormValues,
} from '../features/collaborators/collaborator-model';
import { confirmDiscardChanges, useUnsavedChangesGuard } from '../features/collaborators/useUnsavedChangesGuard';

const ACCESS_REFRESH_SIGNAL_KEY = 'auth-permissions-updated-at';
const outlineLinkButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent';
const UNSAVED_ADMINISTRATIVE_ACTION_WARNING = 'As alterações não salvas do formulário serão descartadas.';
const ADMINISTRATIVE_REFRESH_WARNING = 'A ação foi concluída, mas não foi possível atualizar os dados exibidos. Recarregue a página.';

interface AdministrativeActionOptions<T> {
  confirmation?: string;
  onSuccess?: (result: T) => void;
}

export function CollaboratorFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, loadUser } = useAuthStore();
  const [collaborator, setCollaborator] = useState<ProfessorSummary | null>(null);
  const [items, setItems] = useState<ProfessorSummary[]>([]);
  const [functions, setFunctions] = useState<CollaboratorFunctionOption[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [hourlyRateLevels, setHourlyRateLevels] = useState<HourlyRateLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [administrativeSuccess, setAdministrativeSuccess] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError: setFieldError,
    formState: { errors, isDirty },
  } = useForm<CollaboratorFormValues>({
    resolver: zodResolver(collaboratorFormSchema),
    defaultValues: createCollaboratorFormValues(),
  });

  useUnsavedChangesGuard(isDirty && !submitting && !actionLoading);

  const dataScope = getDataScopeForScreen(user, 'collaborators.registration');
  const actorProfessorId = user?.professor?.id;
  const showCollaboratorBlock = canAccessBlock(user, 'collaborators.registration.collaborator');
  const showManagerBlock = canAccessBlock(user, 'collaborators.registration.manager');
  const canCreate = canCreateCollaborator(dataScope);
  const canEditRecord = collaborator
    ? canWriteCollaborator(actorProfessorId, collaborator, dataScope)
    : false;
  const editingOwnRecord = collaborator ? isSelfCollaborator(actorProfessorId, collaborator) : false;
  const administrativeFieldsEnabled = mode === 'create'
    ? canCreate && showManagerBlock
    : canEditRecord && !editingOwnRecord && showManagerBlock;
  const canUseAdministrativeActions = mode === 'edit' && canEditRecord && dataScope === 'contract';
  const canValidateLegal = canUseAdministrativeActions
    && canAccessBlock(user, 'collaborators.actions.validateLegalFinancial');
  const canResetPassword = canUseAdministrativeActions
    && canAccessBlock(user, 'collaborators.actions.resetPassword');
  const canActivate = canUseAdministrativeActions
    && canAccessBlock(user, 'collaborators.actions.activate');
  const canDeactivate = canUseAdministrativeActions
    && canAccessBlock(user, 'collaborators.actions.deactivate');

  useEffect(() => {
    let active = true;
    const detailRequest = mode === 'edit' ? professorService.get(id) : Promise.resolve(null);

    Promise.all([
      professorService.list(),
      detailRequest,
      collaboratorFunctionService.list(),
      bankService.list(),
      hourlyRateLevelService.list(),
    ])
      .then(([professors, detail, collaboratorFunctions, bankOptions, rateLevels]) => {
        if (!active) return;
        setItems(professors);
        setFunctions(collaboratorFunctions);
        setBanks(bankOptions);
        setHourlyRateLevels(rateLevels);

        if (mode === 'edit') {
          if (!detail) {
            setError('Colaborador não encontrado.');
            return;
          }
          setCollaborator(detail);
          reset(createCollaboratorFormValues(detail));
        } else {
          const firstFunction = collaboratorFunctions.find((item) => item.isActive);
          const managerOptions = professors.filter(
            (item) => item.user.isActive !== false && (item.role === 'master' || item.collaboratorFunction.code === 'manager')
          );
          const defaultManager = managerOptions.find((item) => item.role === 'master') ?? managerOptions[0];
          reset({
            ...createCollaboratorFormValues(),
            collaboratorFunctionId: firstFunction?.id ?? '',
            responsibleManagerId: defaultManager?.id ?? '',
            operationalRoleIds: firstFunction ? [firstFunction.id] : [],
          });
        }
      })
      .catch(() => {
        if (active) {
          setCollaborator(null);
          setError(mode === 'edit' ? 'Colaborador não encontrado.' : 'Não foi possível carregar o formulário.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id, mode, reset]);

  const managers = useMemo(
    () => items.filter((item) => item.user.isActive !== false && (item.role === 'master' || item.collaboratorFunction.code === 'manager') && item.id !== id),
    [id, items]
  );

  const applyCollaboratorSnapshot = (snapshot: ProfessorSummary) => {
    setCollaborator(snapshot);
    reset(createCollaboratorFormValues(snapshot));
  };

  const handleCancel = () => {
    if (!confirmDiscardChanges(isDirty)) return;
    navigate(mode === 'edit' && id ? `/consultas/colaboradores/${id}` : '/consultas/colaboradores');
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    setAdministrativeSuccess(null);
    setTemporaryPassword(null);
    try {
      if (mode === 'create') {
        if (!values.password || values.password.length < 8) {
          setFieldError('password', { type: 'manual', message: 'A senha deve ter no mínimo 8 caracteres' });
          return;
        }
        const created = await professorService.create(toCreateProfessorRequest(values));
        reset(createCollaboratorFormValues(created));
        navigate(`/consultas/colaboradores/${created.id}`, {
          replace: true,
          state: { success: 'Colaborador cadastrado com sucesso.' },
        });
        return;
      }

      if (!collaborator || !canEditRecord) {
        setError('Este colaborador não está disponível para edição no seu escopo de acesso.');
        return;
      }

      const payload = editingOwnRecord
        ? toSelfServiceUpdateProfessorRequest(values)
        : toUpdateProfessorRequest(values);
      const updated = await professorService.update(collaborator.id, payload);
      reset(createCollaboratorFormValues(updated));

      if (editingOwnRecord) {
        await loadUser();
        localStorage.setItem(ACCESS_REFRESH_SIGNAL_KEY, String(Date.now()));
      }

      navigate(`/consultas/colaboradores/${updated.id}`, {
        replace: true,
        state: { success: 'Alterações salvas com sucesso.' },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar o colaborador.');
    } finally {
      setSubmitting(false);
    }
  });

  const confirmAdministrativeAction = (confirmation?: string) => {
    if (confirmation) {
      const message = isDirty
        ? `${confirmation}\n\n${UNSAVED_ADMINISTRATIVE_ACTION_WARNING}`
        : confirmation;
      return window.confirm(message);
    }
    return confirmDiscardChanges(isDirty);
  };

  const executeAdministrativeAction = async <T,>(
    action: () => Promise<T>,
    successMessage: string,
    options: AdministrativeActionOptions<T> = {}
  ): Promise<T | undefined> => {
    if (!collaborator || !confirmAdministrativeAction(options.confirmation)) return undefined;

    setActionLoading(true);
    setError(null);
    setAdministrativeSuccess(null);
    setTemporaryPassword(null);
    try {
      const result = await action();
      reset(createCollaboratorFormValues(collaborator));
      options.onSuccess?.(result);
      setAdministrativeSuccess(successMessage);

      try {
        const refreshed = await professorService.get(collaborator.id);
        applyCollaboratorSnapshot(refreshed);
      } catch {
        setError(ADMINISTRATIVE_REFRESH_WARNING);
      }

      return result;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível concluir a ação administrativa.');
      return undefined;
    } finally {
      setActionLoading(false);
    }
  };

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido.');
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    try {
      const url = await professorService.uploadAvatar(file);
      setValue('avatar', url, { shouldDirty: true, shouldValidate: true });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível enviar a foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando formulário...</div>;
  }

  if (mode === 'edit' && (!collaborator || !canEditRecord)) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-semibold text-foreground">Edição não disponível</p>
        <p className="text-sm text-muted-foreground">O registro não existe ou não pertence ao seu escopo de escrita.</p>
        <Link className={outlineLinkButtonClassName} to={collaborator ? `/consultas/colaboradores/${collaborator.id}` : '/consultas/colaboradores'}><ArrowLeft size={16} /> Voltar à consulta</Link>
      </div>
    );
  }

  if (mode === 'create' && !canCreate) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-semibold text-foreground">Cadastro não disponível</p>
        <p className="text-sm text-muted-foreground">Seu perfil não possui escopo administrativo para cadastrar colaboradores.</p>
        <Link className={outlineLinkButtonClassName} to="/consultas/colaboradores"><ArrowLeft size={16} /> Voltar à consulta</Link>
      </div>
    );
  }

  if (!showCollaboratorBlock && !showManagerBlock) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-semibold text-foreground">Formulário não disponível</p>
        <p className="text-sm text-muted-foreground">Seu perfil não possui acesso aos blocos deste cadastro.</p>
        <Link className={outlineLinkButtonClassName} to="/consultas/colaboradores"><ArrowLeft size={16} /> Voltar à consulta</Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button type="button" variant="ghost" className="mb-1 -ml-3" onClick={handleCancel}><ArrowLeft size={16} /> Voltar</Button>
          <h1 className="text-2xl font-bold text-foreground">{mode === 'create' ? 'Cadastrar colaborador' : `Editar ${collaborator?.user.profile.name}`}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{mode === 'create' ? 'Inclua os dados do novo colaborador.' : 'Revise os dados e execute ações administrativas nesta rota dedicada.'}</p>
        </div>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}

      {mode === 'edit' && collaborator ? (
        <CollaboratorAdministrativeActions
          collaborator={collaborator}
          canValidateLegal={canValidateLegal}
          canResetPassword={canResetPassword}
          canActivate={canActivate}
          canDeactivate={canDeactivate}
          loading={actionLoading}
          successMessage={administrativeSuccess}
          temporaryPassword={temporaryPassword}
          onValidateLegal={() => {
            void executeAdministrativeAction(
              () => professorService.validateLegalFinancial(collaborator.id),
              'Dados jurídicos e financeiros validados com sucesso.',
              { onSuccess: applyCollaboratorSnapshot }
            );
          }}
          onResetPassword={() => {
            void executeAdministrativeAction(
              () => professorService.resetPassword(collaborator.id),
              'Senha temporária gerada com sucesso.',
              {
                confirmation: 'Deseja gerar uma nova senha temporária para este colaborador?',
                onSuccess: (result) => setTemporaryPassword(result.tempPassword),
              }
            );
          }}
          onActivate={() => {
            void executeAdministrativeAction(
              () => professorService.activate(collaborator.id),
              'Colaborador reativado com sucesso.',
              {
                onSuccess: () => setCollaborator((current) => current
                  ? { ...current, user: { ...current.user, isActive: true } }
                  : current),
              }
            );
          }}
          onDeactivate={() => {
            void executeAdministrativeAction(
              () => professorService.deactivate(collaborator.id),
              'Colaborador desativado com sucesso.',
              {
                confirmation: 'Deseja desativar este colaborador?',
                onSuccess: () => setCollaborator((current) => current
                  ? { ...current, user: { ...current.user, isActive: false } }
                  : current),
              }
            );
          }}
        />
      ) : null}

      <CollaboratorForm
        mode={mode}
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        collaboratorFunctions={functions}
        managers={managers}
        banks={banks}
        hourlyRateLevels={hourlyRateLevels}
        showCollaboratorBlock={showCollaboratorBlock}
        showManagerBlock={showManagerBlock}
        administrativeFieldsEnabled={administrativeFieldsEnabled}
        uploadingAvatar={uploadingAvatar}
        onAvatarFile={(file) => void handleAvatarFile(file)}
        onCancel={handleCancel}
        submitting={submitting || actionLoading}
      />
    </form>
  );
}
