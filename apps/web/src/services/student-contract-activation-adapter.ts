import './contract-lifecycle-visibility-refresh';
import type { StudentContractActivationResponse } from '@corrida/types';
import {
  alunoService,
  type StudentContractLink,
} from './aluno.service';
import {
  activateStudentContractWithLifecycle,
  getStudentContractActivationMessage,
  publishStudentContractActivation,
} from './student-contract-activation';

const WINDOW_ADAPTER_MARKER = '__studentContractActivationAdapterInstalled__';
const LEGACY_SUCCESS_MESSAGES = new Set([
  'Contrato ativado com sucesso.',
  'Contrato renovado e ativado com sucesso.',
]);

type MarkedWindow = Window & {
  [WINDOW_ADAPTER_MARKER]?: boolean;
};

type ActivationServiceAdapter = {
  activateStudentContract(
    alunoId: string,
    studentContractId: string
  ): Promise<StudentContractLink>;
};

export function normalizeLegacyActivationFeedback(
  text: string | null | undefined,
  result: StudentContractActivationResponse
) {
  return text && LEGACY_SUCCESS_MESSAGES.has(text.trim())
    ? getStudentContractActivationMessage(result)
    : text;
}

if (typeof window !== 'undefined') {
  const markedWindow = window as MarkedWindow;

  if (!markedWindow[WINDOW_ADAPTER_MARKER]) {
    const service = alunoService as unknown as ActivationServiceAdapter;
    let latestResult: StudentContractActivationResponse | null = null;

    const normalizeRenderedFeedback = () => {
      if (!latestResult || !document.body) return;

      document.querySelectorAll<HTMLElement>('p, span, div').forEach((element) => {
        if (element.childElementCount > 0) return;
        const normalized = normalizeLegacyActivationFeedback(
          element.textContent,
          latestResult as StudentContractActivationResponse
        );
        if (normalized !== element.textContent && normalized) {
          element.textContent = normalized;
        }
      });
    };

    service.activateStudentContract = async (alunoId, studentContractId) => {
      const result = await activateStudentContractWithLifecycle(
        alunoId,
        studentContractId
      );
      latestResult = result;
      publishStudentContractActivation(result);
      queueMicrotask(normalizeRenderedFeedback);

      return result.studentContract as unknown as StudentContractLink;
    };

    const observer = new MutationObserver(normalizeRenderedFeedback);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    markedWindow[WINDOW_ADAPTER_MARKER] = true;
  }
}
