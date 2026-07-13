import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Eye, FileText, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import {
  findStudentContractLink,
  resolveContractValidity,
  type ContractValidityStatus,
} from '../services/contract-validity';
import { contractService, type GeneratedContract } from '../services/contract.service';
import {
  ensurePreservedFinancialServiceOption,
  readPersistedFinancialServiceName,
  resolveFinancialServiceName,
} from '../services/financial-service-preservation';
import { AlunoFormWithContractLifecycle } from './AlunoFormWithContractLifecycle';

const FINANCIAL_SERVICE_FIELD = 'intakeForm.financialInfo.currentService';
const CONTRACT_SECTION_SLOT_ID = 'aluno-contract-section-slot';
const CONTRACT_HISTORY_SLOT_ID = 'aluno-contract-history-slot';

const contractStatusLabel: Record<GeneratedContract['status'], string> = {
  DRAFT: 'Rascunho',
  GENERATED: 'Gerado',
  SENT: 'Enviado',
  VIEWED: 'Visualizado',
  SIGNED: 'Assinado',
  REJECTED: 'Recusado pelo aluno',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

const contractStatusClassName: Record<GeneratedContract['status'], string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  GENERATED: 'border-blue-200 bg-blue-50 text-blue-800',
  SENT: 'border-amber-200 bg-amber-50 text-amber-900',
  VIEWED: 'border-violet-200 bg-violet-50 text-violet-800',
  SIGNED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-800',
  CANCELLED: 'border-slate-300 bg-slate-100 text-slate-700',
  EXPIRED: 'border-orange-200 bg-orange-50 text-orange-800',
};

const contractValidityClassName: Record<ContractValidityStatus, string> = {
  current: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  expired: 'border-orange-300 bg-orange-100 text-orange-900',
  future: 'border-blue-300 bg-blue-100 text-blue-900',
  ended: 'border-slate-300 bg-slate-100 text-slate-700',
  pending: 'border-amber-300 bg-amber-100 text-amber-900',
  undefined: 'border-border bg-muted text-muted-foreground',
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('pt-BR');
};

const getFinancialServiceControl = () =>
  document.querySelector<HTMLSelectElement>(`select[name="${FINANCIAL_SERVICE_FIELD}"]`);

export function AlunoFormWithFinancialContracts() {
  const id = window.location.pathname.match(/^\/alunos\/([^/]+)\/edit/)?.[1] || '';
  const userChangedServiceRef = useRef(false);
  const [financialServiceName, setFinancialServiceName] = useState('');
  const [contractHistorySlot, setContractHistorySlot] = useState<HTMLElement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [studentContractLinks, setStudentContractLinks] = useState<StudentContractLink[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [previewContract, setPreviewContract] = useState<GeneratedContract | null>(null);

  useEffect(() => {
    userChangedServiceRef.current = false;
    setFinancialServiceName('');
    setStudentContractLinks([]);

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
        setStudentContractLinks(contractLinks.contracts);
      })
      .catch(() => {
        if (!active) return;
        setFinancialServiceName('');
        setStudentContractLinks([]);
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

  useEffect(() => {
    if (!historyOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (previewContract) {
        setPreviewContract(null);
        return;
      }
      setHistoryOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [historyOpen, previewContract]);

  const loadContracts = async () => {
    if (!id) return;

    setContractsLoading(true);
    setContractsError(null);
    try {
      const [result, contractLinks] = await Promise.all([
        contractService.listAlunoContracts(id),
        alunoService.listStudentContracts(id),
      ]);
      setContracts(
        [...result].sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )
      );
      setStudentContractLinks(contractLinks.contracts);
    } catch (error: any) {
      setContracts([]);
      setStudentContractLinks([]);
      setContractsError(error?.response?.data?.error || 'Não foi possível carregar os contratos do aluno.');
    } finally {
      setContractsLoading(false);
    }
  };

  const openContractHistory = () => {
    setPreviewContract(null);
    setHistoryOpen(true);
    void loadContracts();
  };

  const closeContractHistory = () => {
    setPreviewContract(null);
    setHistoryOpen(false);
  };

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
                  Consulte o estado do documento e a vigência de cada contrato sem sair do cadastro.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={openContractHistory}>
                <FileText className="mr-2 h-4 w-4" />
                Visualizar contratos
              </Button>
            </div>
          </div>,
          contractHistorySlot
        )}

      {historyOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeContractHistory();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-contract-history-title"
              className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  {previewContract && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewContract(null)}
                      aria-label="Voltar para a lista de contratos"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <div className="min-w-0">
                    <h2
                      id="student-contract-history-title"
                      className="truncate text-lg font-semibold text-foreground"
                    >
                      {previewContract?.title || 'Contratos do aluno'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {previewContract
                        ? 'Documento em modo somente leitura.'
                        : 'Acompanhe separadamente o estado do documento e a vigência contratual.'}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeContractHistory}
                  aria-label="Fechar contratos do aluno"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {previewContract ? (
                <iframe
                  className="min-h-0 flex-1 bg-white"
                  srcDoc={previewContract.renderedHtml}
                  title={previewContract.title}
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {contractsLoading ? (
                    <p className="rounded-lg border border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                      Carregando contratos do aluno...
                    </p>
                  ) : contractsError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                      <p>{contractsError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        onClick={() => void loadContracts()}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  ) : contracts.length === 0 ? (
                    <p className="rounded-lg border border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                      Nenhum contrato foi gerado para este aluno.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {contracts.map((contract) => {
                        const createdAt = formatDateLabel(contract.createdAt);
                        const signedAt = formatDateLabel(contract.signedAt);
                        const rejectedAt = formatDateLabel(contract.rejectedAt);
                        const studentContractLink = findStudentContractLink(
                          contract.id,
                          studentContractLinks
                        );
                        const validity = resolveContractValidity(
                          contract.status,
                          studentContractLink
                        );
                        const validityStart = formatDateLabel(studentContractLink?.startDate);
                        const validityEnd = formatDateLabel(studentContractLink?.endDate);

                        return (
                          <div
                            key={contract.id}
                            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-foreground">{contract.title}</p>
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${contractStatusClassName[contract.status]}`}
                                >
                                  Documento: {contractStatusLabel[contract.status]}
                                </span>
                                {validity && (
                                  <span
                                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${contractValidityClassName[validity.status]}`}
                                  >
                                    Vigência: {validity.label}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Criado em {createdAt || 'data não informada'}
                                {signedAt ? ` • Assinado em ${signedAt}` : ''}
                                {rejectedAt ? ` • Recusado em ${rejectedAt}` : ''}
                              </p>
                              {contract.status === 'SIGNED' && (validityStart || validityEnd) && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Período de vigência: {validityStart || 'início não informado'} até{' '}
                                  {validityEnd || 'sem término definido'}
                                </p>
                              )}
                              {contract.status === 'REJECTED' && contract.rejectionReason && (
                                <p className="mt-2 text-sm text-rose-700">
                                  Motivo da recusa: {contract.rejectionReason}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setPreviewContract(contract)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Consultar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
