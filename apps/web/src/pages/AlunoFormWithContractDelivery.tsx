import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Send } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { contractService, type GeneratedContract } from '../services/contract.service';
import { resolveStudentContractDelivery } from '../services/student-contract-delivery';
import { AlunoFormWithContractPreview } from './AlunoFormWithContractPreview';

const CONTRACT_SECTION_SLOT_ID = 'aluno-contract-section-slot';
const SELECTED_CONTRACT_FIELD = 'intakeForm.financialInfo.selectedContractId';

const getSelectedContractControl = () =>
  document.querySelector<HTMLSelectElement>(`[name="${SELECTED_CONTRACT_FIELD}"]`);

const copyToClipboard = async (value: string) => {
  if (!navigator.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

export function AlunoFormWithContractDelivery() {
  const refreshingParentStatusRef = useRef(false);
  const [contractSectionSlot, setContractSectionSlot] = useState<HTMLElement | null>(null);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [contract, setContract] = useState<GeneratedContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState(false);
  const [sending, setSending] = useState(false);
  const [signatureLink, setSignatureLink] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const delivery = useMemo(
    () =>
      resolveStudentContractDelivery({
        selectedContractId,
        contract,
        loading: contractLoading,
        error: contractError,
      }),
    [selectedContractId, contract, contractLoading, contractError]
  );

  useEffect(() => {
    const syncSlot = () => {
      setContractSectionSlot(document.getElementById(CONTRACT_SECTION_SLOT_ID));
    };

    syncSlot();
    const observer = new MutationObserver(syncSlot);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncSelectedContract = () => {
      if (refreshingParentStatusRef.current) return;
      setSelectedContractId(getSelectedContractControl()?.value?.trim() || '');
    };

    syncSelectedContract();
    document.addEventListener('change', syncSelectedContract);
    const observer = new MutationObserver(syncSelectedContract);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('change', syncSelectedContract);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setSignatureLink('');
    setFeedback(null);
    setCopied(false);
    setContract(null);
    setContractError(false);

    if (!selectedContractId || selectedContractId.startsWith('template:')) {
      setContractLoading(false);
      return undefined;
    }

    let active = true;
    setContractLoading(true);

    contractService
      .getDocument(selectedContractId)
      .then((loadedContract) => {
        if (active) setContract(loadedContract);
      })
      .catch(() => {
        if (active) setContractError(true);
      })
      .finally(() => {
        if (active) setContractLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedContractId]);

  const refreshParentContractStatus = () => {
    const select = getSelectedContractControl();
    if (!select || !selectedContractId) return;

    refreshingParentStatusRef.current = true;
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    window.requestAnimationFrame(() => {
      select.value = selectedContractId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      refreshingParentStatusRef.current = false;
    });
  };

  const handleSend = async () => {
    if (!contract || !delivery.canSend) return;

    if (
      delivery.requiresConfirmation &&
      !window.confirm('Gerar um novo link invalidará o endereço enviado anteriormente. Deseja continuar?')
    ) {
      return;
    }

    setSending(true);
    setFeedback(null);
    setCopied(false);

    try {
      const result = await contractService.sendForSignature(contract.id);
      const publicUrl = `${window.location.origin}/assinatura/contrato/${result.token}`;
      const linkCopied = await copyToClipboard(publicUrl);

      setContract(result.contract);
      setSignatureLink(publicUrl);
      setCopied(linkCopied);
      setFeedback({
        type: 'success',
        message: linkCopied
          ? 'Link de assinatura gerado e copiado. Compartilhe-o manualmente com o aluno.'
          : 'Link de assinatura gerado. Copie o endereço abaixo e compartilhe-o com o aluno.',
      });
      refreshParentContractStatus();
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.error || error?.message || 'Não foi possível gerar o link de assinatura.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!signatureLink) return;
    const linkCopied = await copyToClipboard(signatureLink);
    setCopied(linkCopied);
    setFeedback(
      linkCopied
        ? { type: 'success', message: 'Link de assinatura copiado.' }
        : { type: 'error', message: 'Não foi possível copiar automaticamente. Selecione e copie o endereço.' }
    );
  };

  return (
    <>
      <AlunoFormWithContractPreview />

      {contractSectionSlot &&
        createPortal(
          <div className="mt-4 space-y-4 rounded-xl border border-border bg-muted/20 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Envio para assinatura</h3>
                <p className="mt-1 text-sm text-muted-foreground">{delivery.description}</p>
              </div>
              <Button
                type="button"
                onClick={handleSend}
                isLoading={sending}
                disabled={!delivery.canSend || sending}
              >
                <Send className="mr-2 h-4 w-4" />
                {delivery.actionLabel}
              </Button>
            </div>

            {feedback && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  feedback.type === 'success'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}
              >
                {feedback.message}
              </div>
            )}

            {signatureLink && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Link público de assinatura</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    readOnly
                    value={signatureLink}
                    className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-4 text-sm text-foreground"
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Link público de assinatura"
                  />
                  <Button type="button" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copied ? 'Copiado' : 'Copiar link'}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              O sistema cria o link seguro, mas não envia mensagem automaticamente. Compartilhe o endereço por WhatsApp,
              e-mail ou outro canal. O link é exibido somente nesta sessão; gerar outro link invalida o anterior.
            </p>
          </div>,
          contractSectionSlot
        )}
    </>
  );
}
