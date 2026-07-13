import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { alunoService } from '../services/aluno.service';
import {
  ensurePreservedFinancialServiceOption,
  readPersistedFinancialServiceName,
  resolveFinancialServiceName,
} from '../services/financial-service-preservation';
import { AlunoFormWithContractLifecycle } from './AlunoFormWithContractLifecycle';

const FINANCIAL_SERVICE_FIELD = 'intakeForm.financialInfo.currentService';
const CONTRACT_SECTION_SLOT_ID = 'aluno-contract-section-slot';
const CONTRACT_HISTORY_SLOT_ID = 'aluno-contract-history-slot';

const getFinancialServiceControl = () =>
  document.querySelector<HTMLSelectElement>(`select[name="${FINANCIAL_SERVICE_FIELD}"]`);

export function AlunoFormWithFinancialContracts() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userChangedServiceRef = useRef(false);
  const [financialServiceName, setFinancialServiceName] = useState('');
  const [contractHistorySlot, setContractHistorySlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    userChangedServiceRef.current = false;
    setFinancialServiceName('');

    if (!id) {
      return undefined;
    }

    let active = true;

    Promise.all([alunoService.getById(id), alunoService.listStudentContracts(id)])
      .then(([aluno, contractLinks]) => {
        if (!active) return;

        const persistedFinancialServiceName = readPersistedFinancialServiceName(
          aluno.intakeForm?.formResponses
        );
        const resolvedServiceName = resolveFinancialServiceName({
          activeContractServiceName: contractLinks.activeContract?.service?.name,
          persistedFinancialServiceName,
        });

        setFinancialServiceName(resolvedServiceName);
      })
      .catch(() => {
        if (active) setFinancialServiceName('');
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!financialServiceName) {
      return undefined;
    }

    const syncFinancialService = () => {
      const select = getFinancialServiceControl();
      if (!select || userChangedServiceRef.current) return;

      ensurePreservedFinancialServiceOption(select, financialServiceName);

      if (select.value.trim() === financialServiceName) return;

      select.value = financialServiceName;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const registerManualChange = (event: Event) => {
      const target = event.target;
      if (
        event.isTrusted &&
        target instanceof HTMLSelectElement &&
        target.name === FINANCIAL_SERVICE_FIELD
      ) {
        userChangedServiceRef.current = true;
      }
    };

    syncFinancialService();
    document.addEventListener('change', registerManualChange, true);

    const observer = new MutationObserver(syncFinancialService);
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(syncFinancialService, 250);

    return () => {
      document.removeEventListener('change', registerManualChange, true);
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [financialServiceName]);

  useEffect(() => {
    const syncContractHistorySlot = () => {
      const contractSection = document.getElementById(CONTRACT_SECTION_SLOT_ID);
      if (!contractSection) {
        setContractHistorySlot(null);
        return;
      }

      let slot = document.getElementById(CONTRACT_HISTORY_SLOT_ID);
      if (!slot) {
        slot = document.createElement('div');
        slot.id = CONTRACT_HISTORY_SLOT_ID;
        contractSection.appendChild(slot);
      }

      setContractHistorySlot((current) => (current === slot ? current : slot));
    };

    syncContractHistorySlot();
    const observer = new MutationObserver(syncContractHistorySlot);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.getElementById(CONTRACT_HISTORY_SLOT_ID)?.remove();
    };
  }, []);

  return (
    <>
      <AlunoFormWithContractLifecycle />

      {contractHistorySlot &&
        createPortal(
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-5 w-5 text-primary" />
                  Histórico de contratos
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Consulte contratos em rascunho, enviados, visualizados, assinados, recusados,
                  cancelados ou expirados.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/alunos/${id}/contracts`)}
              >
                <FileText className="mr-2 h-4 w-4" />
                Visualizar contratos
              </Button>
            </div>
          </div>,
          contractHistorySlot
        )}
    </>
  );
}
