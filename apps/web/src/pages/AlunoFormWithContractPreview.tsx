import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { contractService } from '../services/contract.service';
import { serviceCatalogService } from '../services/service.service';
import { resolveStudentContractPreviewTarget } from '../services/student-contract-preview';
import { AlunoForm } from './AlunoForm';

const FINANCIAL_PANEL_ID = 'aluno-panel-financeiro';
const PREVIEW_SLOT_ID = 'aluno-contract-preview-slot';
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
} as const;

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

const getErrorMessage = (error: unknown) => {
  const candidate = error as { response?: { data?: { error?: string } }; message?: string };
  return candidate.response?.data?.error || candidate.message || 'Não foi possível gerar a prévia do contrato.';
};

export function AlunoFormWithContractPreview() {
  const { id = '' } = useParams<{ id: string }>();
  const [financialPanel, setFinancialPanel] = useState<HTMLElement | null>(null);
  const [previewSlot, setPreviewSlot] = useState<HTMLElement | null>(null);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTitle, setPreviewTitle] = useState('Prévia do contrato');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
        'bg-muted/30',
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
      setSelectedContractId('');
      return undefined;
    }

    const syncSelectedContract = () => {
      setSelectedContractId(readFormValue(formFieldNames.selectedContractId));
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

  return (
    <>
      <AlunoForm />

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
