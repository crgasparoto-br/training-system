import { useEffect, useState } from 'react';
import type { PreRegistrationEnrollmentReviewDTO } from '@corrida/types';
import { RefreshCcw, UserCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
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

function failureMessage(error: unknown): string {
  const failure = error as Failure;
  return failure.response?.data?.error || failure.message || 'Não foi possível renovar a revisão.';
}

export function PreRegistrationEnrollmentDetailRemediated() {
  const { id = '' } = useParams();
  const [review, setReview] = useState<PreRegistrationEnrollmentReviewDTO | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspect = async () => {
    setLoading(true);
    setError(null);
    try {
      const lead = await preRegistrationAdminService.get(id);
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
