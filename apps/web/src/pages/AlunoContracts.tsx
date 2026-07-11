import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Eye, FileSignature, Send, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { contractService, type ContractTemplate, type GeneratedContract } from '../services/contract.service';

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

const blockedSendStatuses: GeneratedContract['status'][] = [
  'SIGNED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
];

export default function AlunoContracts() {
  const { id = '' } = useParams();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [previewContract, setPreviewContract] = useState<GeneratedContract | null>(null);

  async function load() {
    const [loadedTemplates, loadedContracts] = await Promise.all([
      contractService.listTemplates(),
      contractService.listAlunoContracts(id),
    ]);
    setTemplates(loadedTemplates.filter((template) => template.status === 'ACTIVE'));
    setContracts(loadedContracts);
    setTemplateId((current) => current || loadedTemplates.find((template) => template.status === 'ACTIVE')?.id || '');
  }

  useEffect(() => {
    load().catch(() => setMessage('Não foi possível carregar contratos.'));
  }, [id]);

  useEffect(() => {
    if (!previewContract) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewContract(null);
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [previewContract]);

  const generate = async () => {
    try {
      await contractService.generate({ templateId, alunoId: id, dataInicio: new Date().toISOString(), dataAssinatura: new Date().toISOString() });
      await load();
      setMessage('Contrato gerado.');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Erro ao gerar contrato.');
    }
  };

  const send = async (contractId: string) => {
    const result = await contractService.sendForSignature(contractId);
    const publicUrl = `${window.location.origin}/assinatura/contrato/${result.token}`;
    await navigator.clipboard?.writeText(publicUrl);
    await load();
    setMessage(`Link de assinatura copiado: ${publicUrl}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contratos do aluno</h1>
        <p className="text-sm text-muted-foreground">Gere, consulte, envie para aceite eletrônico e baixe PDFs.</p>
      </div>
      {message && <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">{message}</div>}
      <Card>
        <CardHeader>
          <CardTitle>Novo contrato</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-sm font-medium">
            Modelo
            <select className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name} v{template.version}</option>)}
            </select>
          </label>
          <Button onClick={generate} disabled={!templateId}>
            <FileSignature size={16} className="mr-2" />
            Gerar
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-4">
        {contracts.map((contract) => (
          <Card key={contract.id}>
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium">{contract.title}</div>
                <div className="text-sm text-muted-foreground">
                  {contractStatusLabel[contract.status]} · {new Date(contract.createdAt).toLocaleDateString('pt-BR')}
                </div>
                {contract.status === 'REJECTED' && contract.rejectionReason && (
                  <div className="mt-1 text-sm text-rose-700">Motivo: {contract.rejectionReason}</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setPreviewContract(contract)}>
                  <Eye size={16} className="mr-2" />
                  Consultar
                </Button>
                <Button variant="outline" onClick={() => contractService.generatePdf(contract.id).then(load)}>
                  <Download size={16} className="mr-2" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => send(contract.id)}
                  disabled={blockedSendStatuses.includes(contract.status)}
                >
                  <Send size={16} className="mr-2" />
                  {contract.status === 'REJECTED' ? 'Recusado' : 'Enviar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {previewContract && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewContract(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-history-preview-title"
            className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 id="contract-history-preview-title" className="text-lg font-semibold text-foreground">
                  {previewContract.title}
                </h2>
                <p className="text-sm text-muted-foreground">Documento em modo somente leitura.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setPreviewContract(null)} aria-label="Fechar contrato">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <iframe
              className="min-h-0 flex-1 bg-white"
              srcDoc={previewContract.renderedHtml}
              title={previewContract.title}
            />
          </div>
        </div>
      )}
    </div>
  );
}
