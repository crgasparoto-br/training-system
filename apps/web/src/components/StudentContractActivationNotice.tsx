import { useEffect, useState } from 'react';
import type { StudentContractActivationResponse } from '@corrida/types';
import { CheckCircle2, Clock3, FileSignature, X } from 'lucide-react';
import { Button } from './ui/Button';
import {
  getStudentContractActivationMessage,
  STUDENT_CONTRACT_ACTIVATION_EVENT,
} from '../services/student-contract-activation';

export function StudentContractActivationNotice() {
  const [result, setResult] = useState<StudentContractActivationResponse | null>(null);

  useEffect(() => {
    const handleActivation = (event: Event) => {
      const activationEvent = event as CustomEvent<StudentContractActivationResponse>;
      setResult(activationEvent.detail);
    };

    window.addEventListener(STUDENT_CONTRACT_ACTIVATION_EVENT, handleActivation);
    return () => {
      window.removeEventListener(STUDENT_CONTRACT_ACTIVATION_EVENT, handleActivation);
    };
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    const timeoutId = window.setTimeout(() => setResult(null), 9000);
    return () => window.clearTimeout(timeoutId);
  }, [result]);

  if (!result) return null;

  const Icon =
    result.reason === 'awaiting_signature'
      ? FileSignature
      : result.reason === 'scheduled_start'
        ? Clock3
        : CheckCircle2;

  return (
    <div
      className="fixed bottom-5 right-5 z-[160] w-[min(420px,calc(100vw-2rem))] rounded-xl border border-emerald-300 bg-background p-4 shadow-2xl"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Situação do contrato atualizada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {getStudentContractActivationMessage(result)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setResult(null)}
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
