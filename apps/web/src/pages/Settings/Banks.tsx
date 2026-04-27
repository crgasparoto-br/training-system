import { useEffect, useState } from 'react';
import type { BankOption } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { bankService } from '../../services/bank.service';

export default function SettingsBanks() {
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadBanks = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await bankService.list();
      setBanks(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível carregar o catálogo de bancos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBanks();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await bankService.sync();
      setBanks(data);
      setSuccessMessage('Catálogo de bancos sincronizado com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível sincronizar o catálogo de bancos.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bancos</h1>
          <p className="text-sm text-muted-foreground">
            Sincronize manualmente a base local de bancos usada no cadastro de colaboradores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={loadBanks} disabled={loading || syncing}>
            Atualizar lista
          </Button>
          <Button type="button" onClick={handleSync} isLoading={syncing} disabled={loading}>
            Sincronizar bancos
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Catálogo local</CardTitle>
          <CardDescription>
            A sincronização busca novamente a lista oficial de bancos e atualiza os registros locais usados pelo sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">Total de bancos disponíveis</p>
            <p className="mt-1 text-3xl font-semibold text-foreground">{loading ? '...' : banks.length}</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Código</span>
              <span>Descrição</span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              {loading ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">Carregando bancos...</div>
              ) : banks.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">Nenhum banco disponível.</div>
              ) : (
                banks.map((bank) => (
                  <div
                    key={bank.code}
                    className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-border/70 px-4 py-3 text-sm last:border-b-0"
                  >
                    <span className="font-medium text-foreground">{bank.code}</span>
                    <span className="text-muted-foreground">{bank.description}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}