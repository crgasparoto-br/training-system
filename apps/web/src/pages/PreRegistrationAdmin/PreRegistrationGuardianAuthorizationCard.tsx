import { useEffect, useState } from 'react';
import type { PreRegistrationGuardianAuthorizationAdminDTO } from '@corrida/types';
import { AlertTriangle, ShieldCheck, ShieldX, UserCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import { formatDate } from './pre-registration-ui';

type ApiFailure = {
  response?: { status?: number; data?: { error?: string } };
  message?: string;
};

function errorMessage(error: unknown) {
  const failure = error as ApiFailure;
  return failure.response?.data?.error || failure.message || 'Não foi possível atualizar o vínculo.';
}

export function PreRegistrationGuardianAuthorizationCard({ leadId }: { leadId: string }) {
  const [authorization, setAuthorization] =
    useState<PreRegistrationGuardianAuthorizationAdminDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [revocationConfirmed, setRevocationConfirmed] = useState(false);
  const [revocationReason, setRevocationReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setAuthorization(await preRegistrationAdminService.getGuardianAuthorization(leadId));
      setHidden(false);
    } catch (reason) {
      const failure = reason as ApiFailure;
      if (failure.response?.status === 403 || failure.response?.status === 404) {
        setHidden(true);
        return;
      }
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [leadId]);

  const approve = async () => {
    setActionLoading(true);
    setError('');
    try {
      setAuthorization(await preRegistrationAdminService.approveGuardianAuthorization(leadId));
      setApprovalConfirmed(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setActionLoading(false);
    }
  };

  const revoke = async () => {
    setActionLoading(true);
    setError('');
    try {
      setAuthorization(
        await preRegistrationAdminService.revokeGuardianAuthorization(
          leadId,
          revocationReason.trim()
        )
      );
      setRevocationReason('');
      setRevocationConfirmed(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setActionLoading(false);
    }
  };

  if (hidden || (!loading && !authorization)) return null;

  return (
    <Card className={authorization?.status === 'PENDING' ? 'border-warning/50' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserCheck className="h-5 w-5" aria-hidden="true" />
          Responsável legal
        </CardTitle>
        <CardDescription>
          A declaração do responsável não libera dados do menor. A academia precisa validar o vínculo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando vínculo...</p>
        ) : authorization ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Conta do responsável</dt>
                <dd className="mt-1 font-medium">{authorization.guardian.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">E-mail da conta</dt>
                <dd className="mt-1 break-all font-medium">{authorization.guardian.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vínculo declarado</dt>
                <dd className="mt-1 font-medium">
                  {authorization.relationship || 'Ainda não informado'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Situação</dt>
                <dd className="mt-1 font-medium">
                  {authorization.status === 'PENDING'
                    ? 'Aguardando validação'
                    : authorization.status === 'ACTIVE'
                      ? 'Validado'
                      : 'Revogado'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Solicitado em</dt>
                <dd className="mt-1 font-medium">{formatDate(authorization.requestedAt)}</dd>
              </div>
              {authorization.validatedAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Validado em</dt>
                  <dd className="mt-1 font-medium">{formatDate(authorization.validatedAt)}</dd>
                </div>
              ) : null}
            </dl>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            {authorization.status === 'PENDING' ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <p>
                    Confirme o vínculo usando os dados e procedimentos internos da academia. A
                    posse do link e esta declaração não comprovam responsabilidade legal.
                  </p>
                </div>
                <label className="mt-4 flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={approvalConfirmed}
                    onChange={(event) => setApprovalConfirmed(event.target.checked)}
                  />
                  <span>
                    Confirmo que validei este vínculo por fonte independente da declaração do
                    responsável.
                  </span>
                </label>
                <Button
                  type="button"
                  className="mt-4"
                  isLoading={actionLoading}
                  disabled={!authorization.relationship || !approvalConfirmed}
                  onClick={approve}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Validar vínculo
                </Button>
              </div>
            ) : null}

            {authorization.status === 'ACTIVE' ? (
              <div className="rounded-xl border border-border p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Vínculo validado por {authorization.validatedBy?.name || 'usuário autorizado'}.
                </p>
                <label className="mt-4 block space-y-2">
                  <span className="text-sm font-medium">Motivo da revogação *</span>
                  <Input
                    value={revocationReason}
                    onChange={(event) => setRevocationReason(event.target.value)}
                    placeholder="Explique por que o acesso será removido"
                  />
                </label>
                <label className="mt-3 flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={revocationConfirmed}
                    onChange={(event) => setRevocationConfirmed(event.target.checked)}
                  />
                  <span>Confirmo a revogação imediata do acesso aos dados do menor.</span>
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="mt-3"
                  isLoading={actionLoading}
                  disabled={!revocationReason.trim() || !revocationConfirmed}
                  onClick={revoke}
                >
                  <ShieldX className="h-4 w-4" aria-hidden="true" />
                  Revogar vínculo
                </Button>
              </div>
            ) : null}

            {authorization.status === 'REVOKED' ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                Este vínculo foi revogado e não concede acesso aos dados do menor.
              </p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
