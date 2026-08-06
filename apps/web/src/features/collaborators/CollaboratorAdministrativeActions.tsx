import { KeyRound, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import type { ProfessorSummary } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { CollaboratorSection } from './CollaboratorSection';
import { CollaboratorContractControl } from './CollaboratorContractControl';

interface CollaboratorAdministrativeActionsProps {
  collaborator: ProfessorSummary;
  canValidateLegal: boolean;
  canResetPassword: boolean;
  canActivate: boolean;
  canDeactivate: boolean;
  loading: boolean;
  successMessage: string | null;
  temporaryPassword: string | null;
  onValidateLegal: () => void;
  onResetPassword: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}

export function CollaboratorAdministrativeActions({
  collaborator,
  canValidateLegal,
  canResetPassword,
  canActivate,
  canDeactivate,
  loading,
  successMessage,
  temporaryPassword,
  onValidateLegal,
  onResetPassword,
  onActivate,
  onDeactivate,
}: CollaboratorAdministrativeActionsProps) {
  const profile = collaborator.user.profile;
  const hasLegalFinancialData = Boolean(
    profile.companyDocument
      || profile.bankCode
      || profile.bankName
      || profile.bankBranch
      || profile.bankAccount
      || profile.pixKey
  );
  const canShowResetPassword = canResetPassword && collaborator.role !== 'master';
  const canShowActivate = canActivate
    && collaborator.user.isActive === false
    && collaborator.role !== 'master';
  const canShowDeactivate = canDeactivate
    && collaborator.user.isActive !== false
    && collaborator.role !== 'master';
  const hasVisibleAdministrativeContent = canValidateLegal
    || canShowResetPassword
    || canShowActivate
    || canShowDeactivate
    || Boolean(successMessage)
    || Boolean(temporaryPassword);

  return (
    <div className="space-y-5">
      <CollaboratorContractControl collaboratorId={collaborator.id} />

      {hasVisibleAdministrativeContent ? (
        <CollaboratorSection
          title="Ações administrativas"
          description="Gerencie validação, acesso e situação do colaborador."
          defaultOpen={Boolean(successMessage || temporaryPassword)}
        >
          <div className="space-y-3">
            {successMessage ? (
              <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}
            {temporaryPassword ? (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Senha temporária: <strong>{temporaryPassword}</strong>. Oriente o colaborador a alterá-la no próximo acesso.
              </div>
            ) : null}
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {canValidateLegal ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={loading || !hasLegalFinancialData}
                  onClick={onValidateLegal}
                >
                  <ShieldCheck size={16} /> Validar dados financeiros
                </Button>
              ) : null}
              {canShowResetPassword ? (
                <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={loading} onClick={onResetPassword}>
                  <KeyRound size={16} /> Redefinir senha
                </Button>
              ) : null}
              {canShowActivate ? (
                <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={loading} onClick={onActivate}>
                  <UserCheck size={16} /> Reativar
                </Button>
              ) : null}
              {canShowDeactivate ? (
                <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={loading} onClick={onDeactivate}>
                  <UserX size={16} /> Desativar
                </Button>
              ) : null}
            </div>
          </div>
        </CollaboratorSection>
      ) : null}
    </div>
  );
}
