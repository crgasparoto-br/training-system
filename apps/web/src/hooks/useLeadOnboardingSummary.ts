import { useCallback, useEffect, useState } from 'react';
import type { ParqSessionDTO, PreRegistrationSessionDTO } from '@corrida/types';
import { preRegistrationPublicService } from '../services/pre-registration-public.service';

export type LeadOnboardingSummaryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-a-lead' }
  | { status: 'active-student' }
  | { status: 'discarded' }
  | {
      status: 'open';
      session: PreRegistrationSessionDTO;
      parq: ParqSessionDTO | null;
    };

function apiErrorMessage(error: unknown): string {
  const value = error as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return (
    value.response?.data?.error ||
    value.response?.data?.message ||
    value.message ||
    'Não foi possível carregar o resumo do seu cadastro.'
  );
}

const CADASTRO_CONCLUIDO_STATUSES = new Set(['PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT']);

export function useLeadOnboardingSummary(enabled: boolean, preferredAlunoId?: string) {
  const [state, setState] = useState<LeadOnboardingSummaryState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ status: 'not-a-lead' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const processes = await preRegistrationPublicService.listProcesses();
      const preferred = preferredAlunoId
        ? processes.find((process) => process.alunoId === preferredAlunoId)
        : undefined;

      if (preferredAlunoId && !preferred) {
        setState({ status: 'not-a-lead' });
        return;
      }
      if (preferred?.status === 'ACTIVE_STUDENT') {
        setState({ status: 'active-student' });
        return;
      }
      if (preferred?.status === 'DISCARDED') {
        setState({ status: 'discarded' });
        return;
      }

      const eligible =
        preferred ||
        processes.find(
          (process) => process.status !== 'ACTIVE_STUDENT' && process.status !== 'DISCARDED'
        );

      if (!eligible) {
        if (processes.some((process) => process.status === 'ACTIVE_STUDENT')) {
          setState({ status: 'active-student' });
          return;
        }
        if (processes.some((process) => process.status === 'DISCARDED')) {
          setState({ status: 'discarded' });
          return;
        }
        setState({ status: 'not-a-lead' });
        return;
      }

      const session = await preRegistrationPublicService.getSession(eligible.alunoId);

      if (session.status === 'ACTIVE_STUDENT') {
        setState({ status: 'active-student' });
        return;
      }
      if (session.status === 'DISCARDED') {
        setState({ status: 'discarded' });
        return;
      }

      let parq: ParqSessionDTO | null = null;
      if (CADASTRO_CONCLUIDO_STATUSES.has(session.status)) {
        try {
          parq = await preRegistrationPublicService.getParq(eligible.alunoId);
        } catch {
          parq = null;
        }
      }

      setState({ status: 'open', session, parq });
    } catch (error) {
      setState({ status: 'error', message: apiErrorMessage(error) });
    }
  }, [enabled, preferredAlunoId]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  return { state, retry };
}
