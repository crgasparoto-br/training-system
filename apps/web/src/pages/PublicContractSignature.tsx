import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, PenLine } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { contractService, type GeneratedContract } from '../services/contract.service';

export default function PublicContractSignature() {
  const { token = '' } = useParams();
  const [contract, setContract] = useState<GeneratedContract | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
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
      await contractService.signPublic(token, { signerName, signerCpf, signerEmail });
      setMessage('Contrato assinado com sucesso.');
      setContract((current) => current ? { ...current, status: 'SIGNED', signedAt: new Date().toISOString() } : current);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Não foi possível assinar.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-6 text-muted-foreground">Carregando contrato...</div>;
  }

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
              {contract?.status === 'SIGNED' ? <CheckCircle2 size={20} /> : <PenLine size={20} />}
              Assinatura eletrônica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</div>}
            {contract && contract.status !== 'SIGNED' && (
              <>
                <Input label="Nome completo" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
                <Input label="CPF" value={signerCpf} onChange={(event) => setSignerCpf(event.target.value)} />
                <Input label="E-mail" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} />
                <Button className="w-full" onClick={sign} isLoading={signing} disabled={!signerName || !signerCpf}>
                  Aceitar e assinar
                </Button>
              </>
            )}
            {contract?.status === 'SIGNED' && (
              <p className="text-sm text-muted-foreground">
                Documento assinado em {contract.signedAt ? new Date(contract.signedAt).toLocaleString('pt-BR') : 'data registrada'}.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
