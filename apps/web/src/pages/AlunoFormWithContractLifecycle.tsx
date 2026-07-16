import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, ShieldCheck, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import { contractService } from '../services/contract.service';
import { AlunoFormWithContractDelivery } from './AlunoFormWithContractDelivery';

const CONTRACT_SECTION_SLOT_ID = 'aluno-contract-section-slot';
const CONTRACT_LIFECYCLE_SLOT_ID = 'aluno-contract-lifecycle-slot';

const formatDateLabel = (value?: string | null) => {
  if (!value) return 'Não informada';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Não informada';
  return parsed.toLocaleDateString('pt-BR');
};

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return 'Não informada';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Não informada';
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function AlunoFormWithContractLifecycle() {
  const { id = '' } = useParams<{ id: string }>();
  const [lifecycleSlot, setLifecycleSlot] = useState<HTMLElement | null>(null);
  const [activeContract, setActiveContract] = useState<StudentContractLink | null>(null);
  const [activeContractLoading, setActiveContractLoading] = useState(true);
  const [activeContractError, setActiveContractError] = useState<string | null>(null);
  const [consultingCurrent, setConsultingCurrent] = useState(false);
  const [currentContractPreview, setCurrentContractPreview] = useState('');
  const [currentContractPreviewTitle, setCurrentContractPreviewTitle] =
    useState('Contrato vigente');
  const [currentContractPreviewError, setCurrentContractPreviewError] =
    useState<string | null>(null);

  const activeDocumentSignedAt =
    activeContract?.contract.signedAt || activeContract?.signedAt || null;
  const currentContractIsSigned = Boolean(
    activeDocumentSignedAt || activeContract?.contract.status === 'SIGNED'
  );

  const loadActiveContract = useCallback(async () => {
    if (!id) {
      setActiveContract(null);
      setActiveContractLoading(false);
      return;
    }

    setActiveContractLoading(true);
    setActiveContractError(null);

    try {
      const result = await alunoService.listStudentContracts(id);
      setActiveContract(result.activeContract);
    } catch (error: any) {
      setActiveContract(null);
      setActiveContractError(
        error?.response?.data?.error ||
          'Não foi possível consultar o contrato vigente.'
      );
    } finally {
      setActiveContractLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadActiveContract();

    const refreshOnFocus = () => {
      void loadActiveContract();
    };

    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [loadActiveContract]);

  useEffect(() => {
    const syncLifecycleSlot = () => {
      const existing = document.getElementById(CONTRACT_LIFECYCLE_SLOT_ID);
      if (existing) {
        setLifecycleSlot(existing);
        return;
      }

      const contractSection = document.getElementById(CONTRACT_SECTION_SLOT_ID);
      if (!contractSection) {
        setLifecycleSlot(null);
        return;
      }

      const directChildren = Array.from(contractSection.children) as HTMLElement[];
      const selectorBlock =
        directChildren.find((child) =>
          child.querySelector(
            'select[name="intakeForm.financialInfo.selectedContractId"]'
          )
        ) || directChildren[1];

      if (!selectorBlock?.parentElement) {
        setLifecycleSlot(null);
        return;
      }

      const slot = document.createElement('div');
      slot.id = CONTRACT_LIFECYCLE_SLOT_ID;
      selectorBlock.parentElement.insertBefore(slot, selectorBlock.nextSibling);
      setLifecycleSlot(slot);
    };

    syncLifecycleSlot();
    const observer = new MutationObserver(syncLifecycleSlot);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.getElementById(CONTRACT_LIFECYCLE_SLOT_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    const hiddenElements = new Set<HTMLElement>();

    const hideLegacyContractSummary = () => {
      const contractSection = document.getElementById(CONTRACT_SECTION_SLOT_ID);
      if (!contractSection) return;

      Array.from(contractSection.children).forEach((child) => {
        if (
          !(child instanceof HTMLElement) ||
          child.id === CONTRACT_LIFECYCLE_SLOT_ID
        ) {
          return;
        }

        const text = child.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (
          text.startsWith('Contrato ativo atual:') ||
          text ===
            'Este aluno já possui um contrato ativo. A ativação do novo contrato substituirá o vigente somente após a assinatura e a data efetiva definida, sem encerramento imediato.'
        ) {
          child.classList.add('hidden');
          hiddenElements.add(child);
        }
      });
    };

    hideLegacyContractSummary();
    const observer = new MutationObserver(hideLegacyContractSummary);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      hiddenElements.forEach((element) => element.classList.remove('hidden'));
    };
  }, []);

  useEffect(() => {
    if (!currentContractPreview) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCurrentContractPreview('');
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [currentContractPreview]);

  const handleConsultCurrentContract = async () => {
    if (!activeContract) return;

    setConsultingCurrent(true);
    setCurrentContractPreviewError(null);
    try {
      const document = await contractService.getDocument(activeContract.contractId);
      setCurrentContractPreviewTitle(
        document.title || activeContract.contract.title || 'Contrato vigente'
      );
      setCurrentContractPreview(document.renderedHtml);
    } catch (error: any) {
      setCurrentContractPreviewError(
        error?.response?.data?.error ||
          'Não foi possível abrir o contrato vigente.'
      );
    } finally {
      setConsultingCurrent(false);
    }
  };

  return (
    <>
      <AlunoFormWithContractDelivery />

      {lifecycleSlot &&
        createPortal(
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  Contrato vigente
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Este é o vínculo que continua valendo até a entrada em vigor de
                  outro contrato assinado.
                </p>
              </div>
              {activeContract && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConsultCurrentContract}
                  isLoading={consultingCurrent}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Consultar contrato vigente
                </Button>
              )}
            </div>

            {activeContractLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Consultando vínculo vigente...
              </p>
            ) : activeContractError ? (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {activeContractError}
              </p>
            ) : activeContract ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-base font-semibold text-foreground">
                    {activeContract.contract.title}
                  </p>
                  <span className="inline-flex self-start rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {currentContractIsSigned ? 'Vigente e assinado' : 'Vigente'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-emerald-200 bg-white/80 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Assinatura
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatDateTimeLabel(activeDocumentSignedAt)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-white/80 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Início da vigência
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatDateLabel(activeContract.startDate)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-white/80 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Término
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {activeContract.endDate
                        ? formatDateLabel(activeContract.endDate)
                        : 'Em vigor'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-border bg-white/70 px-4 py-3 text-sm text-muted-foreground">
                O aluno ainda não possui um contrato vigente. Um novo vínculo só
                será ativado após assinatura e início da vigência.
              </p>
            )}

            {currentContractPreviewError && (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {currentContractPreviewError}
              </p>
            )}
          </div>,
          lifecycleSlot
        )}

      {currentContractPreview &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setCurrentContractPreview('');
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="current-contract-preview-title"
              className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="current-contract-preview-title"
                    className="text-lg font-semibold text-foreground"
                  >
                    {currentContractPreviewTitle}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Contrato atualmente vigente, em modo somente leitura.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentContractPreview('')}
                  aria-label="Fechar contrato vigente"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <iframe
                className="min-h-0 flex-1 bg-white"
                srcDoc={currentContractPreview}
                title={currentContractPreviewTitle}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
