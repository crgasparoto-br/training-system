import { useState } from 'react';
import type { PreRegistrationAdminLeadDetailDTO } from '@corrida/types';
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

export type InviteCopyState = 'idle' | 'copied' | 'failed';

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
  const isRegeneration = lead.allowedActions.canRegenerateInvite;

  const revoke = async () => {
    await onRevoke(revokeReason.trim());
    setRevokeReason('');
    setRevokeConfirmed(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="h-5 w-5" aria-hidden="true" />
          Convite de pré-cadastro
        </CardTitle>
        <CardDescription>
          O link bruto aparece somente nesta sessão, logo após gerar ou substituir o convite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 font-medium">{lead.invite?.status || 'Ainda não gerado'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Validade</p>
            <p className="mt-1 font-medium">{formatDate(lead.invite?.expiresAt)}</p>
          </div>
        </div>

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
              <p className="mt-2 flex items-start gap-2 text-xs font-medium text-warning" role="alert">
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

        {isRegeneration && (
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

        {(lead.allowedActions.canGenerateInvite || isRegeneration) && (
          <Button
            type="button"
            isLoading={actionLoading}
            disabled={isRegeneration && !regenerateConfirmed}
            onClick={onGenerate}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {isRegeneration ? 'Substituir convite' : 'Gerar link'}
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
              disabled={!revokeReason.trim() || !revokeConfirmed}
              onClick={revoke}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Revogar convite
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
