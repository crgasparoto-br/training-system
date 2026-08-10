import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Eye, FilePlus2, FileText, Send, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { canAccessBlock } from '../../access/access-control';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  collaboratorContractService,
  type CollaboratorContractDraftInput,
  type CollaboratorContractRecord,
  type CollaboratorContractSummary,
  type CollaboratorContractTemplate,
} from '../../services/collaborator-contract.service';
import { CollaboratorSection } from './CollaboratorSection';

const emptySummary: CollaboratorContractSummary = {
  current: null,
  candidates: [],
  history: [],
  all: [],
};

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '—';

const statusLabel: Record<string, string> = {
  draft: 'Rascunho',
  pending_signature: 'Aguardando assinatura/início',
  active: 'Vigente',
  expired: 'Expirado',
  canceled: 'Cancelado',
  terminated: 'Encerrado',
  legacy: 'Legado',
  GENERATED: 'Gerado',
  SENT: 'Enviado',
  VIEWED: 'Visualizado',
  SIGNED: 'Assinado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

function ContractRecordCard({
  item,
  canManage,
  busy,
  onView,
  onGeneratePdf,
  onOpenPdf,
  onSend,
  onActivate,
  onCancel,
}: {
  item: CollaboratorContractRecord;
  canManage: boolean;
  busy: boolean;
  onView: (item: CollaboratorContractRecord) => void;
  onGeneratePdf: (item: CollaboratorContractRecord) => void;
  onOpenPdf: (item: CollaboratorContractRecord) => void;
  onSend: (item: CollaboratorContractRecord) => void;
  onActivate: (item: CollaboratorContractRecord) => void;
  onCancel: (item: CollaboratorContractRecord) => void;
}) {
  const electronic = item.origin === 'ELECTRONIC' && Boolean(item.contractId);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">
              {item.documentTitle || (item.origin === 'LEGACY_PDF' ? 'Documento legado' : 'Declaração legada')}
            </p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {item.rejectedAt ? 'Recusado' : (statusLabel[item.status] || item.status)}
            </span>
            {item.documentStatus ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                {statusLabel[item.documentStatus] || item.documentStatus}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Início: {formatDate(item.startDate)} · Assinatura: {formatDate(item.signedAt)} · Encerramento: {formatDate(item.endDate)}
          </p>
          {item.origin !== 'ELECTRONIC' ? (
            <p className="mt-2 text-sm text-amber-700">
              {item.origin === 'LEGACY_PDF'
                ? 'Documento legado importado. Não representa assinatura eletrônica, token, IP ou evidência de aceite.'
                : 'Contrato informado no cadastro, sem documento eletrônico verificável.'}
            </p>
          ) : null}
          {item.rejectedAt ? (
            <p className="mt-2 text-sm text-rose-700">
              Recusado em {formatDate(item.rejectedAt)}
              {item.rejectionReason ? `: ${item.rejectionReason}` : '.'}
            </p>
          ) : null}
          {item.cancellationReason ? (
            <p className="mt-2 text-sm text-muted-foreground">Motivo: {item.cancellationReason}</p>
          ) : null}
          {item.legacyDocumentUrl ? (
            <a
              href={item.legacyDocumentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Abrir PDF legado
            </a>
          ) : null}
        </div>

        {electronic ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onView(item)}>
              <Eye size={14} /> Consultar
            </Button>
            {item.pdfPath ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onOpenPdf(item)}>
                <FileText size={14} /> Abrir PDF
              </Button>
            ) : canManage ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onGeneratePdf(item)}>
                <FileText size={14} /> Gerar PDF
              </Button>
            ) : null}
            {canManage && !item.rejectedAt && item.documentStatus !== 'SIGNED' && item.documentStatus !== 'CANCELLED' && item.documentStatus !== 'EXPIRED' ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSend(item)}>
                <Send size={14} /> Enviar
              </Button>
            ) : null}
            {canManage && item.documentStatus === 'SIGNED' && item.status !== 'active' ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onActivate(item)}>
                <CheckCircle2 size={14} /> Colocar em vigor
              </Button>
            ) : null}
            {canManage && !item.rejectedAt && item.documentStatus !== 'SIGNED' && item.status !== 'canceled' ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onCancel(item)}>
                <XCircle size={14} /> Cancelar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CollaboratorContractControl({
  collaboratorId,
  readOnly = false,
}: {
  collaboratorId: string;
  readOnly?: boolean;
}) {
  const { user } = useAuthStore();
  const canManage = !readOnly && canAccessBlock(user, 'collaborators.actions.uploadSignedContract');
  const [summary, setSummary] = useState<CollaboratorContractSummary>(emptySummary);
  const [templates, setTemplates] = useState<CollaboratorContractTemplate[]>([]);
  const [draft, setDraft] = useState<CollaboratorContractDraftInput>({
    templateId: '',
    dataInicio: '',
    horarios: '',
  });
  const [previewHtml, setPreviewHtml] = useState('');
  const [documentHtml, setDocumentHtml] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === draft.templateId),
    [templates, draft.templateId]
  );

  const load = async () => {
    setLoading(true);
    try {
      const nextSummary = await collaboratorContractService.summary(collaboratorId);
      const nextTemplates = canManage
        ? await collaboratorContractService.listTemplates()
        : [];

      setSummary(nextSummary);
      setTemplates(nextTemplates);
      setDraft((current) => ({
        ...current,
        templateId: nextTemplates.some((template) => template.id === current.templateId)
          ? current.templateId
          : nextTemplates[0]?.id || '',
      }));
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Não foi possível carregar o controle contratual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [collaboratorId, canManage]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error: any) {
      setMessage(error.response?.data?.error || error.message || 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  };

  const preview = () => run(async () => {
    if (!draft.templateId) throw new Error('Selecione um modelo de contrato.');
    const result = await collaboratorContractService.preview(collaboratorId, draft);
    setPreviewHtml(result.html);
    setMessage(`Prévia gerada com o modelo ${selectedTemplate?.name || 'selecionado'}.`);
  });

  const generate = () => run(async () => {
    if (!draft.templateId) throw new Error('Selecione um modelo de contrato.');
    await collaboratorContractService.generate(collaboratorId, draft);
    setPreviewHtml('');
    setSignatureUrl('');
    await load();
    setMessage('Novo contrato gerado como candidato. O contrato vigente foi preservado.');
  });

  const viewDocument = (item: CollaboratorContractRecord) => run(async () => {
    if (!item.contractId) return;
    const document = await collaboratorContractService.getDocument(collaboratorId, item.contractId);
    setDocumentHtml(document.renderedHtml || '');
    setMessage('Documento persistido carregado em modo somente leitura.');
  });

  const openPdf = (item: CollaboratorContractRecord) => run(async () => {
    if (!item.contractId) return;
    const blob = await collaboratorContractService.downloadPdf(collaboratorId, item.contractId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setMessage('PDF persistido aberto em uma nova guia.');
  });

  const generatePdf = (item: CollaboratorContractRecord) => run(async () => {
    if (!item.contractId) return;
    await collaboratorContractService.generatePdf(collaboratorId, item.contractId);
    await load();
    setMessage('PDF gerado com sucesso.');
  });

  const send = (item: CollaboratorContractRecord) => run(async () => {
    if (!item.contractId) return;
    const result = await collaboratorContractService.sendForSignature(collaboratorId, item.contractId);
    const url = `${window.location.origin}/assinatura/contrato/${result.token}`;
    setSignatureUrl(url);
    await navigator.clipboard?.writeText(url);
    await load();
    setMessage('Link de assinatura gerado e copiado. O contrato vigente permanece inalterado até a assinatura e o início da vigência.');
  });

  const activate = (item: CollaboratorContractRecord) => run(async () => {
    await collaboratorContractService.activate(collaboratorId, item.id);
    await load();
    setMessage('Vigência processada com sucesso.');
  });

  const cancel = (item: CollaboratorContractRecord) => run(async () => {
    if (!item.contractId) return;
    await collaboratorContractService.cancel(collaboratorId, item.contractId);
    await load();
    setMessage('Contrato candidato cancelado sem alterar o contrato vigente.');
  });

  return (
    <CollaboratorSection
      title="Controle contratual"
      description={readOnly
        ? 'Consulte o contrato vigente, os candidatos e todo o histórico contratual do colaborador.'
        : 'Acompanhe o contrato vigente, prepare substituições e consulte todo o histórico do colaborador.'}
    >
      <div className="space-y-5">
        {message ? (
          <div role="status" className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
            {message}
          </div>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Carregando contratos...</p> : null}

        {!loading ? (
          <div>
            <h3 className="text-sm font-semibold text-foreground">Contrato vigente</h3>
            <div className="mt-2">
              {summary.current ? (
                <ContractRecordCard
                  item={summary.current}
                  canManage={canManage}
                  busy={busy}
                  onView={viewDocument}
                  onGeneratePdf={generatePdf}
                  onOpenPdf={openPdf}
                  onSend={send}
                  onActivate={activate}
                  onCancel={cancel}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nenhum contrato eletrônico vigente. Registros legados aparecem no histórico e não são tratados como vigência eletrônica.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {canManage ? (
          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <FilePlus2 size={18} />
              <h3 className="font-semibold text-foreground">Preparar novo contrato</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A geração cria um candidato. O contrato vigente só será encerrado quando o novo documento estiver assinado e entrar em vigor.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-medium text-foreground md:col-span-2">
                Modelo
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.templateId}
                  onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}
                >
                  <option value="">Selecione um modelo</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.applicability === 'BOTH' ? 'Aluno e colaborador' : 'Colaborador'}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Início planejado"
                type="date"
                value={draft.dataInicio || ''}
                onChange={(event) => setDraft({ ...draft, dataInicio: event.target.value })}
              />
              <Input
                label="Dia de vencimento"
                type="number"
                min={1}
                max={31}
                value={draft.diaVencimento || ''}
                onChange={(event) => setDraft({ ...draft, diaVencimento: event.target.value ? Number(event.target.value) : undefined })}
              />
              <Input
                label="Valor mensal"
                type="number"
                min={0}
                step="0.01"
                value={draft.valorMensal ?? ''}
                onChange={(event) => setDraft({ ...draft, valorMensal: event.target.value ? Number(event.target.value) : undefined })}
              />
              <div className="md:col-span-2 xl:col-span-3">
                <Input
                  label="Condições, horários ou observações"
                  value={draft.horarios || ''}
                  onChange={(event) => setDraft({ ...draft, horarios: event.target.value, notes: event.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy || !draft.templateId} onClick={preview}>
                <Eye size={16} /> Prévia
              </Button>
              <Button type="button" disabled={busy || !draft.templateId} onClick={generate}>
                <FilePlus2 size={16} /> Gerar candidato
              </Button>
            </div>
          </div>
        ) : null}

        {signatureUrl ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-medium">Link de assinatura</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input readOnly value={signatureUrl} className="h-10 flex-1 rounded-md border border-blue-200 bg-white px-3 text-sm" />
              <Button type="button" variant="outline" onClick={() => void navigator.clipboard?.writeText(signatureUrl)}>
                <Clipboard size={16} /> Copiar
              </Button>
            </div>
          </div>
        ) : null}

        {documentHtml ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Documento persistido</h3>
            <iframe
              title="Documento persistido do contrato do colaborador"
              srcDoc={documentHtml}
              sandbox=""
              className="h-[560px] w-full rounded-xl border border-border bg-white"
            />
          </div>
        ) : null}

        {previewHtml ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Prévia</h3>
            <iframe
              title="Prévia do contrato do colaborador"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[560px] w-full rounded-xl border border-border bg-white"
            />
          </div>
        ) : null}

        {!loading && summary.candidates.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-foreground">Candidatos</h3>
            <div className="mt-2 space-y-2">
              {summary.candidates.map((item) => (
                <ContractRecordCard
                  key={item.id}
                  item={item}
                  canManage={canManage}
                  busy={busy}
                  onView={viewDocument}
                  onGeneratePdf={generatePdf}
                  onOpenPdf={openPdf}
                  onSend={send}
                  onActivate={activate}
                  onCancel={cancel}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!loading && summary.history.length > 0 ? (
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Histórico ({summary.history.length})
            </summary>
            <div className="mt-3 space-y-2">
              {summary.history.map((item) => (
                <ContractRecordCard
                  key={item.id}
                  item={item}
                  canManage={false}
                  busy={busy}
                  onView={viewDocument}
                  onGeneratePdf={generatePdf}
                  onOpenPdf={openPdf}
                  onSend={send}
                  onActivate={activate}
                  onCancel={cancel}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </CollaboratorSection>
  );
}
