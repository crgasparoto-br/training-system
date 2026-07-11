import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, Copy, Send, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import { contractService, type GeneratedContract } from '../services/contract.service';
import { resolveStudentContractDelivery } from '../services/student-contract-delivery';
import {
  resolveStudentContractReplacement,
  shouldBypassLegacyContractReplacementConfirm,
} from '../services/student-contract-replacement';
import { AlunoFormWithContractPreview } from './AlunoFormWithContractPreview';

const CONTRACT_SECTION_SLOT_ID = 'aluno-contract-section-slot';
const CONTRACT_DELIVERY_SLOT_ID = 'aluno-contract-delivery-slot';
const CONTRACT_REPLACEMENT_PANEL_ID = 'aluno-contract-replacement-confirmation';
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

const findContractStatusBlock = (contractSection: HTMLElement) => {
  const heading = Array.from(contractSection.querySelectorAll<HTMLHeadingElement>('h4')).find(
    (candidate) => candidate.textContent?.trim() === 'Status do contrato'
  );

  return heading?.parentElement?.parentElement?.parentElement || null;
};

export function AlunoFormWithContractDelivery() {
  const { id = '' } = useParams<{ id: string }>();
  const refreshingParentStatusRef = useRef(false);
  const replacementConfirmedRef = useRef(false);
  const [deliverySlot, setDeliverySlot] = useState<HTMLElement | null>(null);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [activeStudentContract, setActiveStudentContract] = useState<StudentContractLink | null>(null);
  const [activeContractLoading, setActiveContractLoading] = useState(Boolean(id));
  const [confirmedReplacementContractId, setConfirmedReplacementContractId] = useState('');
  const [replacementFeedback, setReplacementFeedback] = useState<string | null>(null);
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

  const replacement = useMemo(
    () =>
      resolveStudentContractReplacement({
        activeContractId: activeStudentContract?.contractId,
        selectedContractId,
        confirmedForContractId: confirmedReplacementContractId,
      }),
    [activeStudentContract?.contractId, selectedContractId, confirmedReplacementContractId]
  );

  const replacementCheckPending = Boolean(id && selectedContractId && activeContractLoading);
  const replacementCanProceed = !replacementCheckPending && replacement.canProceed;
  const activeContractIsSigned = Boolean(
    activeStudentContract?.contract.status === 'SIGNED' ||
      activeStudentContract?.contract.signedAt ||
      activeStudentContract?.signedAt
  );

  useEffect(() => {
    replacementConfirmedRef.current = replacement.confirmed;
  }, [replacement.confirmed]);

  useEffect(() => {
    const nativeConfirm = window.confirm.bind(window);
    const replacementAwareConfirm = (message?: string) => {
      if (shouldBypassLegacyContractReplacementConfirm(message, replacementConfirmedRef.current)) {
        return true;
      }

      return nativeConfirm(message);
    };

    window.confirm = replacementAwareConfirm;

    return () => {
      if (window.confirm === replacementAwareConfirm) {
        window.confirm = nativeConfirm;
      }
    };
  }, []);

  useEffect(() => {
    const syncSlot = () => {
      const existingSlot = document.getElementById(CONTRACT_DELIVERY_SLOT_ID);
      if (existingSlot) {
        setDeliverySlot(existingSlot);
        return;
      }

      const contractSection = document.getElementById(CONTRACT_SECTION_SLOT_ID);
      if (!contractSection) {
        setDeliverySlot(null);
        return;
      }

      const statusBlock = findContractStatusBlock(contractSection);
      if (!statusBlock?.parentElement) {
        setDeliverySlot(null);
        return;
      }

      const slot = document.createElement('div');
      slot.id = CONTRACT_DELIVERY_SLOT_ID;
      statusBlock.parentElement.insertBefore(slot, statusBlock);
      setDeliverySlot(slot);
    };

    syncSlot();
    const observer = new MutationObserver(syncSlot);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.getElementById(CONTRACT_DELIVERY_SLOT_ID)?.remove();
    };
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
    if (!id) {
      setActiveStudentContract(null);
      setActiveContractLoading(false);
      return undefined;
    }

    let active = true;
    setActiveContractLoading(true);

    alunoService
      .listStudentContracts(id)
      .then((result) => {
        if (active) setActiveStudentContract(result.activeContract);
      })
      .catch(() => {
        if (active) setActiveStudentContract(null);
      })
      .finally(() => {
        if (active) setActiveContractLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, selectedContractId]);

  useEffect(() => {
    setConfirmedReplacementContractId('');
    setReplacementFeedback(null);
  }, [selectedContractId, activeStudentContract?.contractId]);

  useEffect(() => {
    let attachedForm: HTMLFormElement | null = null;

    const handleSubmitCapture = (event: SubmitEvent) => {
      if (replacementCanProceed) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setReplacementFeedback(
        replacementCheckPending
          ? 'Aguarde a verificação do contrato vigente antes de salvar.'
          : 'Confirme a troca do contrato antes de salvar o cadastro.'
      );
      window.requestAnimationFrame(() => {
        document.getElementById(CONTRACT_REPLACEMENT_PANEL_ID)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    };

    const syncForm = () => {
      const nextForm = getSelectedContractControl()?.form || null;
      if (nextForm === attachedForm) return;

      attachedForm?.removeEventListener('submit', handleSubmitCapture, true);
      attachedForm = nextForm;
      attachedForm?.addEventListener('submit', handleSubmitCapture, true);
    };

    syncForm();
    const observer = new MutationObserver(syncForm);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      attachedForm?.removeEventListener('submit', handleSubmitCapture, true);
    };
  }, [replacementCanProceed, replacementCheckPending]);

  useEffect(() => {
    const syncRejectedOptions = () => {
      const select = getSelectedContractControl();
      if (!select) return;

      Array.from(select.options).forEach((option) => {
        if (!option.textContent?.includes('• REJECTED')) return;
        option.textContent = option.textContent.replace('• REJECTED', '• Recusado pelo aluno');
        option.disabled = true;
      });
    };

    syncRejectedOptions();
    const observer = new MutationObserver(syncRejectedOptions);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
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

  const handleConfirmReplacement = () => {
    if (!replacement.required || !selectedContractId || !activeStudentContract) return;

    const contractStateLabel = activeContractIsSigned ? 'assinado' : 'ativo';
    const confirmed = window.confirm(
      `O contrato ${contractStateLabel} "${activeStudentContract.contract.title}" será encerrado quando este cadastro for salvo. Confirma a troca pelo novo contrato selecionado?`
    );

    if (!confirmed) return;

    setConfirmedReplacementContractId(selectedContractId);
    setReplacementFeedback('Troca confirmada. O contrato atual será encerrado somente ao salvar o cadastro.');
  };

  const handleSend = async () => {
    if (!contract || !delivery.canSend || !replacementCanProceed) return;

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

      {deliverySlot &&
        createPortal(
          <div className="space-y-4">
            {replacementCheckPending && (
              <div
                id={CONTRACT_REPLACEMENT_PANEL_ID}
                className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
              >
                Verificando o contrato vigente antes de liberar a troca e o envio.
              </div>
            )}

            {!replacementCheckPending && replacement.required && activeStudentContract && (
              <div
                id={CONTRACT_REPLACEMENT_PANEL_ID}
                className={`space-y-4 rounded-xl border p-4 ${
                  replacement.confirmed
                    ? 'border-emerald-300 bg-emerald-50/70'
                    : 'border-amber-300 bg-amber-50'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {replacement.confirmed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                      ) : (
                        <ShieldAlert className="h-5 w-5 text-amber-700" />
                      )}
                      Confirmação da troca de contrato
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      O aluno possui o contrato {activeContractIsSigned ? 'assinado' : 'ativo'}{' '}
                      <strong className="text-foreground">{activeStudentContract.contract.title}</strong>. Ao salvar,
                      esse vínculo será encerrado e o novo contrato selecionado será ativado.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={replacement.confirmed ? 'outline' : 'default'}
                    onClick={handleConfirmReplacement}
                    disabled={replacement.confirmed}
                  >
                    {replacement.confirmed ? (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    ) : (
                      <ShieldAlert className="mr-2 h-4 w-4" />
                    )}
                    {replacement.confirmed ? 'Troca confirmada' : 'Confirmar troca de contrato'}
                  </Button>
                </div>

                {replacementFeedback && (
                  <p
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      replacement.confirmed
                        ? 'border-emerald-300 bg-white/70 text-emerald-800'
                        : 'border-amber-300 bg-white/70 text-amber-900'
                    }`}
                  >
                    {replacementFeedback}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  A confirmação vale somente para o contrato atualmente selecionado. Alterar a seleção exigirá uma nova confirmação.
                </p>
              </div>
            )}

            <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Envio para assinatura</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {replacementCheckPending
                      ? 'Aguarde a verificação do contrato vigente antes de preparar o envio.'
                      : replacement.required && !replacement.confirmed
                        ? 'Confirme a troca do contrato atual antes de enviar o novo documento para assinatura.'
                        : delivery.description}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleSend}
                  isLoading={sending}
                  disabled={!delivery.canSend || sending || !replacementCanProceed}
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
            </div>
          </div>,
          deliverySlot
        )}
    </>
  );
}
