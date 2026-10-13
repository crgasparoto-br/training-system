
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { prontuarioService } from '../../services/prontuario.service';
import type { ProntuarioHealthIntakeRevision } from '@corrida/types';
import { useProntuarioHistoryPages } from './useProntuarioHistoryPages';

export function ProntuarioHealthIntakeHistory({ alunoId, refreshToken }: {
  alunoId: string;
  refreshToken: unknown;
}) {
  const { events, loading, loadingMore, hasMore, error, loadMore, retry } =
    useProntuarioHistoryPages<ProntuarioHealthIntakeRevision>(
      alunoId || null,
      refreshToken,
      (skip) => prontuarioService.healthIntakeHistory(alunoId, { skip }),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versões da Anamnese Inicial</CardTitle>
        <CardDescription>Respostas históricas da fonte clínica original, sem copiar dados para o prontuário.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p role="status" className="text-sm text-muted-foreground">Carregando Anamnese...</p>}
        {error && (
          <div role="alert" className="text-sm text-destructive">
            Não foi possível consultar as versões da Anamnese.
            <button type="button" className="ml-2 underline" onClick={events.length ? loadMore : retry}>Tentar novamente</button>
          </div>
        )}
        {!loading && !error && events.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão disponível.</p>}
        {!loading && events.map((event) => (
          <details key={event.id} className="min-w-0 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Versão {event.revision} · {new Date(event.createdAt).toLocaleString('pt-BR')}</summary>
            <p className="mt-2 text-xs text-muted-foreground">Origem: {event.sourceType} · Formulário: {event.formVersion ?? 'não informado'}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">Autor: {event.actorUserId ?? 'Não identificado (legado)'}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-xs">{JSON.stringify(event.snapshot, null, 2)}</pre>
          </details>
        ))}
        {hasMore && (
          <button type="button" className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
            onClick={loadMore} disabled={loadingMore || loading}>
            {loadingMore ? 'Carregando mais versões...' : 'Carregar versões anteriores'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
