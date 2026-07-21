import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Edit3 } from 'lucide-react';
import type { CollaboratorFunctionOption, ProfessorSummary } from '@corrida/types';
import { professorService } from '../services/professor.service';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { useAuthStore } from '../stores/useAuthStore';
import { canAccessScreen, getDataScopeForScreen } from '../access/access-control';
import { CollaboratorContractControl } from '../features/collaborators/CollaboratorContractControl';
import { CollaboratorSection, ReadonlyField } from '../features/collaborators/CollaboratorSection';
import { canWriteCollaborator } from '../features/collaborators/collaborator-access';
import { formatMaritalStatus } from '../features/collaborators/collaborator-formatters';
import {
  formatAddress,
  formatCollaboratorDate,
  formatCurrency,
  getLegalFinancialStatus,
} from '../features/collaborators/collaborator-model';
import { resolveAssetUrl } from '../utils/assetUrl';

const linkButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover';
const outlineLinkButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent';
const ghostLinkButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent';

export function CollaboratorDetails() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { user } = useAuthStore();
  const [collaborator, setCollaborator] = useState<ProfessorSummary | null>(null);
  const [functions, setFunctions] = useState<CollaboratorFunctionOption[]>([]);
  const [loading, setLoading] = useState(true);

  const hasRegistrationAccess = canAccessScreen(user, 'collaborators.registration');
  const dataScope = getDataScopeForScreen(user, 'collaborators.registration');
  const actorProfessorId = user?.professor?.id;

  useEffect(() => {
    let active = true;

    Promise.all([
      professorService.get(id),
      collaboratorFunctionService.list(),
    ])
      .then(([found, functionOptions]) => {
        if (!active) return;
        setCollaborator(found);
        setFunctions(functionOptions);
      })
      .catch(() => {
        if (active) setCollaborator(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  const operationalRoleNames = useMemo(() => {
    if (!collaborator) return [];
    return collaborator.operationalRoleIds.map(
      (roleId) => functions.find((item) => item.id === roleId)?.name ?? roleId
    );
  }, [collaborator, functions]);

  if (loading) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando colaborador...</div>;
  }

  if (!collaborator) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-semibold text-foreground">Colaborador não encontrado</p>
        <p className="text-sm text-muted-foreground">O registro não existe ou não está disponível para o seu acesso.</p>
        <Link className={outlineLinkButtonClassName} to="/consultas/colaboradores"><ArrowLeft size={16} /> Voltar à consulta</Link>
      </div>
    );
  }

  const profile = collaborator.user.profile;
  const avatarUrl = resolveAssetUrl(profile.avatar);
  const successMessage = (location.state as { success?: string } | null)?.success;
  const canEditRecord = hasRegistrationAccess
    && canWriteCollaborator(actorProfessorId, collaborator, dataScope);

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-border bg-muted text-xl font-semibold">
              {avatarUrl
                ? <img src={avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
                : profile.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <Link className={`${ghostLinkButtonClassName} mb-1 -ml-3`} to="/consultas/colaboradores"><ArrowLeft size={16} /> Voltar</Link>
              <h1 className="truncate text-2xl font-bold text-foreground">{profile.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{collaborator.collaboratorFunction.name}</span>
                <span className={`rounded-full px-2.5 py-1 ${collaborator.user.isActive === false ? 'bg-destructive/10 text-destructive' : 'bg-emerald-100 text-emerald-700'}`}>{collaborator.user.isActive === false ? 'Inativo' : 'Ativo'}</span>
              </div>
            </div>
          </div>
          {canEditRecord ? <Link className={linkButtonClassName} to={`/consultas/colaboradores/${collaborator.id}/edit`}><Edit3 size={16} /> Editar colaborador</Link> : null}
        </div>
      </header>

      {successMessage ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{successMessage}</div> : null}

      <CollaboratorSection title="Resumo do cadastro">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadonlyField label="E-mail" value={collaborator.user.email} />
          <ReadonlyField label="Telefone" value={profile.phone} />
          <ReadonlyField label="Último acesso" value={collaborator.user.lastLoginAt ? new Date(collaborator.user.lastLoginAt).toLocaleString('pt-BR') : 'Nunca acessou'} />
          <ReadonlyField label="Cadastro criado em" value={formatCollaboratorDate(collaborator.createdAt)} />
        </div>
      </CollaboratorSection>

      <CollaboratorSection title="Dados cadastrais">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadonlyField label="Data de nascimento" value={formatCollaboratorDate(profile.birthDate)} />
          <ReadonlyField label="CPF" value={profile.cpf} />
          <ReadonlyField label="RG" value={profile.rg} />
          <ReadonlyField label="Estado civil" value={formatMaritalStatus(profile.maritalStatus)} />
          <div className="md:col-span-2 xl:col-span-4"><ReadonlyField label="Endereço" value={formatAddress(collaborator)} /></div>
        </div>
      </CollaboratorSection>

      <CollaboratorSection title="Dados profissionais">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadonlyField label="CREF" value={profile.cref} />
          <ReadonlyField label="Instagram" value={profile.instagramHandle} />
          <ReadonlyField label="Admissão" value={formatCollaboratorDate(collaborator.admissionDate)} />
          <ReadonlyField label="Desligamento" value={formatCollaboratorDate(collaborator.dismissalDate)} />
          <ReadonlyField label="Gestor responsável" value={collaborator.responsibleManager?.user.profile.name} />
          <ReadonlyField label="Situação operacional" value={collaborator.currentStatus} />
          <div className="md:col-span-2"><ReadonlyField label="Currículo Lattes" value={profile.lattesUrl} /></div>
          <div className="md:col-span-2 xl:col-span-4"><ReadonlyField label="Resumo profissional" value={profile.professionalSummary} /></div>
        </div>
      </CollaboratorSection>

      <CollaboratorSection title="Dados jurídicos e financeiros">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadonlyField label="Situação da validação" value={getLegalFinancialStatus(collaborator)} />
          <ReadonlyField label="Documento da empresa" value={profile.companyDocument} />
          <ReadonlyField label="Banco" value={profile.bankName ? `${profile.bankCode ?? ''} ${profile.bankName}`.trim() : profile.bankCode} />
          <ReadonlyField label="Agência" value={profile.bankBranch} />
          <ReadonlyField label="Conta" value={profile.bankAccount} />
          <ReadonlyField label="Chave Pix" value={profile.pixKey} />
          <ReadonlyField label="Informado em" value={formatCollaboratorDate(profile.legalFinancialProvidedAt)} />
          <ReadonlyField label="Validado em" value={formatCollaboratorDate(profile.legalFinancialValidatedAt)} />
        </div>
      </CollaboratorSection>

      <CollaboratorSection title="Permissões e vínculos operacionais">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadonlyField label="Papel no sistema" value={collaborator.role === 'master' ? 'Master' : 'Colaborador'} />
          <ReadonlyField label="Função principal" value={collaborator.collaboratorFunction.name} />
          <div className="md:col-span-2"><ReadonlyField label="Funções operacionais" value={operationalRoleNames.join(', ')} /></div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">As permissões efetivas continuam sendo aplicadas pelo catálogo de telas, blocos e escopo de dados do contrato.</p>
      </CollaboratorSection>

      <CollaboratorSection title="Remuneração">
        <div className="grid gap-3 md:grid-cols-3">
          <ReadonlyField label="Personal" value={formatCurrency(collaborator.hourlyRates?.personal)} />
          <ReadonlyField label="Consultoria" value={formatCurrency(collaborator.hourlyRates?.consulting)} />
          <ReadonlyField label="Avaliação" value={formatCurrency(collaborator.hourlyRates?.evaluation)} />
        </div>
      </CollaboratorSection>

      <CollaboratorContractControl collaboratorId={collaborator.id} readOnly />
    </div>
  );
}
