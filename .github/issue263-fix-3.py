from pathlib import Path

ROOT = Path.cwd()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

path = ROOT / "apps/web/src/services/collaborator-contract.service.ts"
text = path.read_text()
text = replace_once(
    text,
    """  documentCreatedAt?: string | null;
}""",
    """  documentCreatedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}""",
    "client rejection fields",
)
marker = """  async generatePdf(collaboratorId: string, documentId: string) {"""
insert = """  async getDocument(collaboratorId: string, documentId: string) {
    const response = await api.get<{ success: boolean; data: CollaboratorContractRecord }>(
      `/contracts/collaborators/${collaboratorId}/documents/${documentId}`
    );
    return response.data.data;
  },

  async downloadPdf(collaboratorId: string, documentId: string) {
    const response = await api.get<Blob>(
      `/contracts/collaborators/${collaboratorId}/documents/${documentId}/pdf`,
      { responseType: 'blob' }
    );
    return response.data;
  },

"""
text = replace_once(text, marker, insert + marker, "client document methods")
path.write_text(text)

path = ROOT / "apps/web/src/features/collaborators/CollaboratorContractControl.tsx"
text = path.read_text()
text = text.replace("  onPdf,\n  onSend,", "  onView,\n  onGeneratePdf,\n  onOpenPdf,\n  onSend,")
text = text.replace(
    "  onPdf: (item: CollaboratorContractRecord) => void;\n  onSend:",
    "  onView: (item: CollaboratorContractRecord) => void;\n  onGeneratePdf: (item: CollaboratorContractRecord) => void;\n  onOpenPdf: (item: CollaboratorContractRecord) => void;\n  onSend:",
)
text = text.replace(
    "              {statusLabel[item.status] || item.status}",
    "              {item.rejectedAt ? 'Recusado' : (statusLabel[item.status] || item.status)}",
)
text = text.replace(
    """          {item.origin !== 'ELECTRONIC' ? (
            <p className="mt-2 text-sm text-amber-700">
              Registro importado do cadastro anterior. Não representa assinatura eletrônica, token, IP ou evidência de aceite.
            </p>
          ) : null}""",
    """          {item.origin !== 'ELECTRONIC' ? (
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
          ) : null}""",
)
text = replace_once(
    text,
    """        {electronic && canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onPdf(item)}>
              <FileText size={14} /> PDF
            </Button>""",
    """        {electronic ? (
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
            ) : null}""",
    "document actions",
)
text = text.replace(
    "            {item.documentStatus !== 'SIGNED' && item.documentStatus !== 'CANCELLED' && item.documentStatus !== 'EXPIRED' ? (",
    "            {canManage && !item.rejectedAt && item.documentStatus !== 'SIGNED' && item.documentStatus !== 'CANCELLED' && item.documentStatus !== 'EXPIRED' ? (",
)
text = text.replace(
    "            {item.documentStatus === 'SIGNED' && item.status !== 'active' ? (",
    "            {canManage && item.documentStatus === 'SIGNED' && item.status !== 'active' ? (",
)
text = text.replace(
    "            {item.documentStatus !== 'SIGNED' && item.status !== 'canceled' ? (",
    "            {canManage && !item.rejectedAt && item.documentStatus !== 'SIGNED' && item.status !== 'canceled' ? (",
)
text = text.replace(
    "  const [previewHtml, setPreviewHtml] = useState('');\n",
    "  const [previewHtml, setPreviewHtml] = useState('');\n  const [documentHtml, setDocumentHtml] = useState('');\n",
)
marker = """  const generatePdf = (item: CollaboratorContractRecord) => run(async () => {"""
insert = """  const viewDocument = (item: CollaboratorContractRecord) => run(async () => {
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

"""
text = replace_once(text, marker, insert + marker, "document handlers")
text = text.replace(
    "onPdf={generatePdf}",
    "onView={viewDocument}\n                  onGeneratePdf={generatePdf}\n                  onOpenPdf={openPdf}",
)
marker = """        {previewHtml ? (
          <div>"""
insert = """        {documentHtml ? (
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

"""
text = replace_once(text, marker, insert + marker, "persisted document iframe")
text = text.replace(
    "              srcDoc={previewHtml}\n              className=",
    "              srcDoc={previewHtml}\n              sandbox=\"\"\n              className=",
)
path.write_text(text)
