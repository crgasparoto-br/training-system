import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock3, Eye, FileText, X, XCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { contractService, type GeneratedContract } from '../services/contract.service';
import { serviceCatalogService } from '../services/service.service';
import { resolveStudentContractPreviewTarget } from '../services/student-contract-preview';
import {
  resolveStudentContractStatus,
  type StudentContractStatusTone,
} from '../services/student-contract-status';
import { AlunoForm } from './AlunoForm';

const FINANCIAL_PANEL_ID = 'aluno-panel-financeiro';
const PREVIEW_SLOT_ID = 'aluno-contract-preview-slot';
const STATUS_SLOT_ID = 'aluno-contract-status-slot';
const ORIGIN_SECTION_TITLE = 'Origem e observações';
const COMMERCIAL_SECTION_TITLE = 'Oferta e vínculo comercial';

const formFieldNames = {
  selectedContractId: 'intakeForm.financialInfo.selectedContractId',
  currentService: 'intakeForm.financialInfo.currentService',
  monthlyValue: 'intakeForm.financialInfo.monthlyValue',
  paymentDay: 'intakeForm.financialInfo.paymentDay',
  contractStartDate: 'intakeForm.financialInfo.contractStartDate',
  notes: 'intakeForm.financialInfo.otherObservations',
  professorId: 'intakeForm.financialInfo.responsibleProfessorId',
  serviceId: 'serviceId',
  legacyContract: 'intakeForm.financialInfo.contract',
} as const;

const statusToneClassName: Record<StudentContractStatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
};

const readFormValue = (name: string) => {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    `[name="${name}"]`
  );
  return field?.value?.trim() || '';
};

const findSectionByTitle = (financialPanel: HTMLElement, title: string) => {
  const heading = Array.from(financialPanel.querySelectorAll<HTMLHeadingElement>('h3')).find(
    (candidate) => candidate.textContent?.trim() === title
  );

  return heading?.parentElement?.parentElement || null;
};

const findOriginSection = (financialPanel: HTMLElement) =>
  findSectionByTitle(financialPanel, ORIGIN_SECTION_TITLE);

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getErrorMessage = (error: unknown) => {
  const candidate = error as { response?: { data?: { error?: string } }; message?: string };
  return candidate.response?.data?.error || candidate.message || 'Não foi possível gerar a prévia do contrato.';
};

function ContractStatusIcon({ tone, approved }: { tone: StudentContractStatusTone; approved: boolean }) {
  const className = 'h-5 w-5 shrink-0';

  if (approved) return <CheckCircle2 className={className} />;
  if (tone === 'danger') return <XCircle className={className} />;
  if (tone === 'warning') return <Clock3 className={className} />;
  return <FileText className={className} />;
}

export function AlunoFormWithContractPreview() {
  const { id = '' } = useParams<{ id: string }>();
  const [financialPanel, setFinancialPanel] = useState<HTMLElement | null>(null);
  const [previewSlot, setPreviewSlot] = useState<HTMLElement | null>(null);
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [selectedContractLabel, setSelectedContractLabel] = useState('');
  const [generatedContract, setGeneratedContract] = useState<GeneratedContract | null>(null);
  const [contractStatusLoading, setContractStatusLoading] = useState(false);
  const [contractStatusError, setContractStatusError] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTitle, setPreviewTitle] = useState('Prévia do contrato');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const contractStatus = useMemo(
    () =>
      resolveStudentContractStatus({
        selectedContractId,
        contract: generatedContract,
        loading: contractStatusLoading,
        error: contractStatusError,
      }),
    [selectedContractId, generatedContract, contractStatusLoading, contractStatusError]
  );

  useEffect(() => {
    const syncPanel = () => {
      setFinancialPanel(document.getElementById(FINANCIAL_PANEL_ID));
    };

    syncPanel();
    const observer = new MutationObserver(syncPanel);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!financialPanel) {
      setPreviewSlot(null);
      return undefined;
    }

    const existingSlot = document.getElementById(PREVIEW_SLOT_ID);
    if (existingSlot) {
      setPreviewSlot(existingSlot);
      return undefined;
    }

    const originSection = findOriginSection(financialPanel);
    if (!originSection?.parentElement) {
      setPreviewSlot(null);
      return undefined;
    }

    const slot = document.createElement('div');
    slot.id = PREVIEW_SLOT_ID;
    originSection.parentElement.insertBefore(slot, originSection);
    setPreviewSlot(slot);

    return () => {
      slot.remove();
    };
  }, [financialPanel]);

  useEffect(() => {
    if (!financialPanel) return undefined;

    const commercialSection = findSectionByTitle(financialPanel, COMMERCIAL_SECTION_TITLE);
    if (!commercialSection) return undefined;

    let restoreLayout: (() => void) | undefined;

    const applyLayout = () => {
      restoreLayout?.();
      restoreLayout = undefined;

      const directChildren = Array.from(commercialSection.children) as HTMLElement[];
      const headingBlock = directChildren[0];
      const primaryGrid = directChildren[1];
      const serviceBlock = primaryGrid?.children[0] as HTMLElement | undefined;
      const secondaryColumn = primaryGrid?.children[1] as HTMLElement | undefined;
      const specialConditionBlock = secondaryColumn?.children[0] as HTMLElement | undefined;
      const contractBlock = secondaryColumn?.children[1] as HTMLElement | undefined;
      const legacyContractBlock = secondaryColumn?.children[2] as HTMLElement | undefined;
      const scheduleLabel = Array.from(commercialSection.querySelectorAll<HTMLLabelElement>('label')).find(
        (candidate) => candidate.textContent?.trim() === 'Plano de agenda do aluno'
      );
      const scheduleBlock = scheduleLabel?.parentElement || undefined;
      const activeContractBlock = directChildren.find((child) =>
        child.textContent?.includes('Contrato ativo atual:')
      );
      const replacementWarningBlock = directChildren.find((child) =>
        child.textContent?.includes('Este aluno já possui um contrato ativo')
      );

      if (
        !headingBlock ||
        !primaryGrid ||
        !serviceBlock ||
        !secondaryColumn ||
        !specialConditionBlock ||
        !contractBlock ||
        !legacyContractBlock ||
        !scheduleBlock
      ) {
        return;
      }

      const trackedElements = [
        commercialSection,
        headingBlock,
        primaryGrid,
        secondaryColumn,
        serviceBlock,
        specialConditionBlock,
        contractBlock,
        legacyContractBlock,
        scheduleBlock,
        activeContractBlock,
        replacementWarningBlock,
      ].filter((element): element is HTMLElement => Boolean(element));
      const originalClasses = new Map(
        trackedElements.map((element) => [element, element.getAttribute('class') || ''])
      );

      commercialSection.classList.remove('space-y-4');
      commercialSection.classList.add('grid', 'grid-cols-1', 'gap-4', 'xl:grid-cols-2');
      headingBlock.classList.add('xl:col-span-2');

      primaryGrid.className = 'contents';
      secondaryColumn.className = 'contents';

      serviceBlock.classList.add(
        'order-1',
        'rounded-xl',
        'border',
        'border-border',
        'bg-card',
        'p-4'
      );
      specialConditionBlock.classList.add(
        'order-2',
        'rounded-xl',
        'border',
        'border-border',
        'bg-card',
        'p-4'
      );
      contractBlock.classList.add(
        'order-3',
        'rounded-xl',
        'border',
        'border-border',
        'bg-card',
        'p-4',
        'xl:col-span-2'
      );
      activeContractBlock?.classList.add('order-4', 'xl:col-span-2');
      replacementWarningBlock?.classList.add('order-5', 'xl:col-span-2');
      scheduleBlock.classList.add(
        'order-6',
        'rounded-xl',
        'border',
        'border-border',
        'bg-card',
        'p-4'
      );
      legacyContractBlock.classList.add(
        'order-7',
        'rounded-xl',
        'border',
        'border-border',
        'bg-card',
        'p-4'
      );

      restoreLayout = () => {
        originalClasses.forEach((className, element) => {
          element.setAttribute('class', className);
        });
      };
    };

    applyLayout();
    const observer = new MutationObserver(applyLayout);
    observer.observe(commercialSection, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      restoreLayout?.();
    };
  }, [financialPanel]);

  useEffect(() => {
    if (!financialPanel) {
      setStatusSlot(null);
      return undefined;
    }

    const legacyField = financialPanel.querySelector<HTMLInputElement>(
      `[name="${formFieldNames.legacyContract}"]`
    );
    const legacyBlock = legacyField?.closest('div');
    if (!legacyBlock) {
      setStatusSlot(null);
      return undefined;
    }

    const existingSlot = document.getElementById(STATUS_SLOT_ID);
    if (existingSlot) {
      setStatusSlot(existingSlot);
      return undefined;
    }

    const originalChildren = Array.from(legacyBlock.children) as HTMLElement[];
    const hiddenState = new Map(originalChildren.map((child) => [child, child.classList.contains('hidden')]));
    originalChildren.forEach((child) => child.classList.add('hidden'));

    const slot = document.createElement('div');
    slot.id = STATUS_SLOT_ID;
    legacyBlock.appendChild(slot);
    setStatusSlot(slot);

    return () => {
      slot.remove();
      hiddenState.forEach((wasHidden, child) => {
        if (!wasHidden) child.classList.remove('hidden');
      });
    };
  }, [financialPanel]);

  useEffect(() => {
    if (!financialPanel) {
      setSelectedContractId('');
      setSelectedContractLabel('');
      return undefined;
    }

    const syncSelectedContract = () => {
      const select = financialPanel.querySelector<HTMLSelectElement>(
        `[name="${formFieldNames.selectedContractId}"]`
      );
      const value = select?.value?.trim() || '';
      const label = value ? select?.selectedOptions[0]?.textContent?.trim() || '' : '';
      setSelectedContractId(value);
      setSelectedContractLabel(label);
    };

    syncSelectedContract();
    financialPanel.addEventListener('change', syncSelectedContract);
    financialPanel.addEventListener('input', syncSelectedContract);

    return () => {
      financialPanel.removeEventListener('change', syncSelectedContract);
      financialPanel.removeEventListener('input', syncSelectedContract);
    };
  }, [financialPanel]);

  useEffect(() => {
    setGeneratedContract(null);
    setContractStatusError(false);

    if (!selectedContractId || selectedContractId.startsWith('template:')) {
      setContractStatusLoading(false);
      return undefined;
    }

    let active = true;
    setContractStatusLoading(true);

    contractService
      .getDocument(selectedContractId)
      .then((contract) => {
        if (active) setGeneratedContract(contract);
      })
      .catch(() => {
        if (active) setContractStatusError(true);
      })
      .finally(() => {
        if (active) setContractStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedContractId]);

  useEffect(() => {
    if (!previewHtml) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewHtml('');
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [previewHtml]);

  const handlePreview = async () => {
    if (!id || !selectedContractId) {
      setPreviewError('Selecione um contrato para visualizar a prévia.');
      return;
    }

    setPreviewing(true);
    setPreviewError(null);

    try {
      const currentServiceName = readFormValue(formFieldNames.currentService);
      const structuralServiceId = readFormValue(formFieldNames.serviceId);
      const services = currentServiceName
        ? await serviceCatalogService.list().catch(() => [])
        : [];
      const selectedFinancialService = services.find((service) => service.name === currentServiceName);

      const target = resolveStudentContractPreviewTarget({
        alunoId: id,
        selectedContractId,
        serviceId: selectedFinancialService?.id || structuralServiceId,
        professorId: readFormValue(formFieldNames.professorId),
        monthlyValue: readFormValue(formFieldNames.monthlyValue),
        paymentDay: readFormValue(formFieldNames.paymentDay),
        contractStartDate: readFormValue(formFieldNames.contractStartDate),
        notes: readFormValue(formFieldNames.notes),
      });

      if (!target) {
        throw new Error('Não foi possível identificar o contrato selecionado.');
      }

      if (target.kind === 'template') {
        const preview = await contractService.preview(target.request);
        setPreviewTitle('Prévia do modelo de contrato');
        setPreviewHtml(preview.html);
      } else {
        const contract = await contractService.getDocument(target.contractId);
        setPreviewTitle(contract.title || 'Contrato gerado');
        setPreviewHtml(contract.renderedHtml);
      }
    } catch (error) {
      setPreviewHtml('');
      setPreviewError(getErrorMessage(error));
    } finally {
      setPreviewing(false);
    }
  };

  const signedAtLabel = formatDateTimeLabel(contractStatus.signedAt);
  const displayedContractTitle = generatedContract?.title || selectedContractLabel || 'Nenhum contrato selecionado';

  return (
    <>
      <AlunoForm />

      {statusSlot &&
        createPortal(
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Status do contrato</h3>
                <p className="mt-1 text-sm text-muted-foreground">{displayedContractTitle}</p>
              </div>
              <div
                className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold ${statusToneClassName[contractStatus.tone]}`}
              >
                <ContractStatusIcon tone={contractStatus.tone} approved={contractStatus.approved} />
                {contractStatus.label}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aluno aprovou?</p>
                <p className={`mt-1 text-base font-semibold ${contractStatus.approved ? 'text-emerald-700' : 'text-foreground'}`}>
                  {contractStatus.approvalLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assinatura</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {signedAtLabel || (contractStatus.approved ? 'Data não informada' : 'Ainda não assinou')}
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{contractStatus.description}</p>
            <p className="text-xs text-muted-foreground">
              O status é obtido do documento eletrônico. O vínculo ativo ou o texto legado não confirmam aprovação do aluno.
            </p>
          </div>,
          statusSlot
        )}

      {previewSlot &&
        createPortal(
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Prévia do contrato</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Visualize o documento com os dados atuais antes de salvar, gerar ou enviar para assinatura.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                isLoading={previewing}
                disabled={!selectedContractId || previewing}
              >
                <Eye className="mr-2 h-4 w-4" />
                Abrir prévia
              </Button>
            </div>
            {previewError && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {previewError}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              A prévia é somente leitura. Nenhum contrato é criado, alterado, enviado ou assinado nesta etapa.
            </p>
          </div>,
          previewSlot
        )}

      {previewHtml &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setPreviewHtml('');
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-contract-preview-title"
              className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <h2 id="student-contract-preview-title" className="text-lg font-semibold text-foreground">
                    {previewTitle}
                  </h2>
                  <p className="text-sm text-muted-foreground">Visualização administrativa, sem ação de assinatura.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setPreviewHtml('')} aria-label="Fechar prévia">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <iframe
                className="min-h-0 flex-1 bg-white"
                srcDoc={previewHtml}
                title={previewTitle}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
