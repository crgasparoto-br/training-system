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

const getErrorMessage = (error: unknown) => {
  const candidate = error as { response?: { data?: { error?: string } }; message?: string };
  return candidate.response?.data?.error || candidate.message || 'Não foi possível gerar a prévia do contrato.';
};

export function AlunoFormWithContractPreview() {
  const { id = '' } = useParams<{ id: string }>();
  const [financialPanel, setFinancialPanel] = useState<HTMLElement | null>(null);
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
      const services = currentServiceName ? await serviceCatalogService.list() : [];
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

      {financialPanel &&
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
          financialPanel
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
