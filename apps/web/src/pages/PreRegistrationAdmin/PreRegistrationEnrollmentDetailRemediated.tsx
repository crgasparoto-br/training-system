import { useEffect, useState } from 'react';
import type {
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationEnrollmentReviewDTO,
} from '@corrida/types';
import { AlertCircle, RefreshCcw, UserCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
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
import { PreRegistrationEnrollmentDetail } from './PreRegistrationEnrollmentDetail';

type Failure = { response?: { data?: { error?: string } }; message?: string };
type PendingItem = PreRegistrationAdminLeadDetailDTO['pendencies'][number];

function failureMessage(error: unknown): string {
  const failure = error as Failure;
  return failure.response?.data?.error || failure.message || 'Não foi possível renovar a revisão.';
}

export function PreRegistrationEnrollmentDetailRemediated() {
  const { id = '' } = useParams();
  const [review, setReview] = useState<PreRegistrationEnrollmentReviewDTO | null>(null);
  const [pendencies, setPendencies] = useState<PendingItem[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspect = async () => {
    setLoading(true);
    setError(null);
    try {
      const lead = await preRegistrationAdminService.get(id);
      setPendencies(lead.pendencies);
      if (lead.status !== 'READY_FOR_ENROLLMENT') {
        setReview(null);
        return;
      }
      const current = await preRegistrationAdminService.getEnrollmentReview(id);
      setReview(current.canMarkReady ? current : null);
    } catch (inspectionError) {
      setError(failureMessage(inspectionError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void inspect();
  }, [id]);

  const renew = async () => {
    if (!review || !reason.trim()) return;
    setWorking(true);
    setError(null);
    try {
      await preRegistrationAdminService.reviewEnrollment(id, {
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        reason: reason.trim(),
      });
      window.location.reload();
    } catch (renewalError) {
      setError(failureMessage(renewalError));
      await inspect();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      {pendencies.length > 0 && (
        <Card className="border-warning/50" role="region" aria-label="Pendências para matrícula">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              Pendências para matrícula
            </CardTitle>
            <CardDescription>
              Corrija os itens bloqueantes antes de marcar o cadastro como pronto. Itens informativos permanecem visíveis, mas não impedem a matrícula comercial.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              {pendencies.map((pending) => (
                <li
                  key={pending.code}
                  className="flex flex-col gap-1 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">{pending.label}</span>
                  <span className={pending.blocking ? 'ts-badge-warning' : 'ts-badge-secondary'}>
                    {pending.blocking ? 'Bloqueante' : 'Informativa'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Dados cadastrais e comerciais podem ser ajustados na edição administrativa. Consentimento e etapas do convidado devem ser concluídos pelo fluxo de pré-cadastro.
            </p>
            <Link
              className="inline-flex text-sm font-medium text-primary hover:underline"
              to={`/pre-matriculas/${id}/editar`}
            >
              Abrir edição administrativa
            </Link>
          </CardContent>
        </Card>
      )}

      {(review || error) && (
        <Card className="border-warning/50" role="region" aria-label="Renovação da revisão administrativa">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5" aria-hidden="true" />
              Renovar revisão administrativa
            </CardTitle>
            <CardDescription>
              Os dados mudaram depois da última revisão. Confirme novamente a versão atual antes de ativar a matrícula.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {review && (
              <>
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Motivo obrigatório da nova revisão"
                  aria-label="Motivo da nova revisão administrativa"
                />
                <Button
                  isLoading={working}
                  disabled={loading || !reason.trim()}
                  onClick={renew}
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Confirmar nova revisão
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <PreRegistrationEnrollmentDetail />
    </div>
  );
}
