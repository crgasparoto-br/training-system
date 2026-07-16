import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, PenLine, XCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { contractService, type GeneratedContract } from '../services/contract.service';

const terminalStatuses: GeneratedContract['status'][] = [
  'SIGNED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
];

const formatDateLabel = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'data programada'
    : parsed.toLocaleDateString('pt-BR');
};

export default function PublicContractSignature() {
  const { token = '' } = useParams();
  const [contract, setContract] = useState<GeneratedContract | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    contractService.openPublic(token)
      .then(setContract)
      .catch((error) => setMessage(error.response?.data?.error || 'Link inválido ou expirado.'))
      .finally(() => setLoading(false));
  }, [token]);

  const sign = async () => {
    setSigning(true);
    setMessage(null);
    try {
      const result = await contractService.signPublic(token, { signerName, signerCpf, signerEmail });
      setMessage(
        result.activation.scheduled
          ? `Contrato assinado com sucesso. Ele entrará em vigor em ${formatDateLabel(result.activation.effectiveAt)}. Até essa data, o contrato vigente atual permanece válido.`
          : 'Contrato assinado e colocado em vigor com sucesso.'
      );
      setContract((current) => current ? { ...current, status: 'SIGNED', signedAt: new Date().toISOString() } : current);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Não foi possível assinar.');
    } finally {
      setSigning(false);
    }
  };

  const reject = async () => {
    if (!window.confirm('Confirma que não aceita este contrato? Depois da recusa, este link não poderá ser usado para assinatura.')) {
      return;
    }

    setRejecting(true);
    setMessage(null);
    try {
      const rejectedContract = await contractService.rejectPublic(token, rejectionReason);
      setContract(rejectedContract);
      setShowRejectionForm(false);
      setMessage(
        'Recusa registrada. Se já houver um contrato vigente, ele permanece válido. A empresa poderá revisar as condições e gerar um novo documento.'
      );
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Não foi possível registrar a recusa.');
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-6 text-muted-foreground">Carregando contrato...</div>;
  }

  const canRespond = Boolean(contract && !terminalStatuses.includes(contract.status));
  const isRejected = contract?.status === 'REJECTED';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <iframe
          className="h-[calc(100vh-2rem)] w-full rounded-md border border-border bg-white"
          srcDoc={contract?.renderedHtml || `<p>${message || 'Contrato indisponível.'}</p>`}
          title="Contrato"
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {contract?.status === 'SIGNED' ? (
                <CheckCircle2 size={20} />
              ) : isRejected ? (
                <XCircle size={20} />
              ) : (
                <PenLine size={20} />
              )}
              {isRejected ? 'Contrato recusado' : 'Assinatura eletrônica'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</div>}

            {canRespond && contract && (
              <>
                <Input label="Nome completo" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
                <Input label="CPF" value={signerCpf} onChange={(event) => setSignerCpf(event.target.value)} />
                <Input label="E-mail" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} />
                <Button className="w-full" onClick={sign} isLoading={signing} disabled={!signerName || !signerCpf || rejecting}>
                  Aceitar e assinar
                </Button>

                {!showRejectionForm ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    onClick={() => setShowRejectionForm(true)}
                    disabled={signing}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Não aceitar contrato
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="contract-rejection-reason">
                        Motivo da recusa <span className="font-normal text-muted-foreground">(opcional)</span>
                      </label>
                      <textarea
                        id="contract-rejection-reason"
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        maxLength={1000}
                        rows={4}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Explique o que precisa ser revisto no contrato."
                      />
                      <p className="mt-1 text-right text-xs text-muted-foreground">{rejectionReason.length}/1000</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowRejectionForm(false);
                          setRejectionReason('');
                        }}
                        disabled={rejecting}
                      >
                        Voltar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                        onClick={reject}
                        isLoading={rejecting}
                        disabled={signing}
                      >
                        Confirmar recusa
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {contract?.status === 'SIGNED' && (
              <p className="text-sm text-muted-foreground">
                Documento assinado em {contract.signedAt ? new Date(contract.signedAt).toLocaleString('pt-BR') : 'data registrada'}.
              </p>
            )}

            {isRejected && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Recusa registrada em {contract.rejectedAt ? new Date(contract.rejectedAt).toLocaleString('pt-BR') : 'data registrada'}.
                </p>
                {contract.rejectionReason && (
                  <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800">
                    Motivo informado: {contract.rejectionReason}
                  </p>
                )}
                <p>Este documento não pode mais ser assinado. Aguarde o envio de um novo contrato.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
