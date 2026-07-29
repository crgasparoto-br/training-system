import { useState } from 'react';
import type {
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationInviteStatus,
} from '@corrida/types';
import { AlertTriangle, ClipboardCopy, Link2, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { formatDate } from './pre-registration-ui';
import { PreRegistrationGuardianAuthorizationCard } from './PreRegistrationGuardianAuthorizationCard';

export type InviteCopyState = 'idle' | 'copied' | 'failed';

const INVITE_STATUS_LABELS: Record<PreRegistrationInviteStatus, string> = {
  ACTIVE: 'Ativo',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
  SUPERSEDED: 'Substituído',
  COMPLETED: 'Concluído',
};

export function PreRegistrationInviteCard({
  lead,
  actionLoading,
  generatedUrl,
  copyState,
  onGenerate,
  onCopy,
  onRevoke,
}: {
  lead: PreRegistrationAdminLeadDetailDTO;
  actionLoading: boolean;
  generatedUrl: string | null;
  copyState: InviteCopyState;
  onGenerate: () => Promise<void>;
  onCopy: () => Promise<void>;
  onRevoke: (reason: string) => Promise<void>;
}) {
  const [regenerateConfirmed, setRegenerateConfirmed] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const canReplaceActiveInvite = lead.allowedActions.canRegenerateInvite;
  const canGenerateAfterClosedInvite = Boolean(
    lead.invite && lead.invite.allowedActions.canGenerateFirst
  );
  const canGenerateInvite =
    lead.allowedActions.canGenerateInvite ||
    canReplaceActiveInvite ||
    canGenerateAfterClosedInvite;
  const inviteExpiredWhileOpen = Boolean(
    lead.invite?.status === 'ACTIVE' &&
      lead.invite.expiresAt &&
      new Date(lead.invite.expiresAt).getTime() <= Date.now()
  );

  const revoke = async () => {
    await onRevoke(revokeReason.trim());
    setRevokeReason('');
    setRevokeConfirmed(false);
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="h-5 w-5" aria-hidden="true" />
          Convite de pré-cadastro
        </CardTitle>
        <CardDescription>
          O link bruto aparece somente nesta sessão. O sistema não envia mensagens automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 font-medium">
              {lead.invite ? INVITE_STATUS_LABELS[lead.invite.status] : 'Ainda não gerado'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Validade</p>
            <p className="mt-1 font-medium">{formatDate(lead.invite?.expiresAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Primeiro acesso</p>
            <p className="mt-1 font-medium">{formatDate(lead.invite?.firstAccessedAt)}</p>
          </div>
        </div>

        {inviteExpiredWhileOpen && (
          <div
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Este convite expirou enquanto a ficha estava aberta. Atualize a ficha antes de executar outra ação.
            </span>
          </div>
        )}

        {lead.invite?.status === 'ACTIVE' && !generatedUrl && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            O link anterior não pode ser recuperado. Caso ele tenha sido perdido, confirme abaixo para gerar um novo link e invalidar o anterior.
          </p>
        )}

        {lead.invite && lead.invite.status !== 'ACTIVE' && !generatedUrl && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            O convite anterior não está mais disponível. Gere um novo link para retomar o pré-cadastro.
          </p>
        )}

        {generatedUrl && (
          <div className="rounded-xl border border-success/40 bg-success/10 p-4">
            <p className="text-sm font-medium text-foreground">Novo link gerado</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{generatedUrl}</p>
            {copyState === 'copied' && (
              <p className="mt-2 text-xs font-medium text-success" role="status">
                Link copiado automaticamente.
              </p>
            )}
            {copyState === 'failed' && (
              <p
                className="mt-2 flex items-start gap-2 text-xs font-medium text-warning"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                A cópia automática não funcionou. Use o botão abaixo para tentar novamente ou selecione o link.
              </p>
            )}
            <Button type="button" size="sm" className="mt-3" onClick={onCopy}>
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              Copiar link
            </Button>
          </div>
        )}

        {canReplaceActiveInvite && (
          <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={regenerateConfirmed}
              onChange={(event) => setRegenerateConfirmed(event.target.checked)}
            />
            <span>
              Confirmo que o link atual deixará de funcionar assim que o novo convite for gerado.
            </span>
          </label>
        )}

        {canGenerateInvite && (
          <Button
            type="button"
            isLoading={actionLoading}
            disabled={(canReplaceActiveInvite && !regenerateConfirmed) || inviteExpiredWhileOpen}
            onClick={onGenerate}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {lead.invite ? 'Gerar novo link' : 'Gerar link de pré-cadastro'}
          </Button>
        )}

        {lead.allowedActions.canRevokeInvite && (
          <div className="rounded-xl border border-border p-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Motivo da revogação *</span>
              <Input
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                placeholder="Explique por que o link será invalidado"
              />
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={revokeConfirmed}
                onChange={(event) => setRevokeConfirmed(event.target.checked)}
              />
              <span>Confirmo que a pessoa não poderá mais acessar este link.</span>
            </label>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="mt-3"
              isLoading={actionLoading}
              disabled={!revokeReason.trim() || !revokeConfirmed || inviteExpiredWhileOpen}
              onClick={revoke}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Revogar convite
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    {lead.allowedActions.canValidateGuardianAuthorization ? (
      <PreRegistrationGuardianAuthorizationCard leadId={lead.id} />
    ) : null}
    </>
  );
}
