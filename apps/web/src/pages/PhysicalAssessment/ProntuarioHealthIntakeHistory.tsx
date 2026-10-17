
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { prontuarioService } from '../../services/prontuario.service';
import type { ProntuarioHealthIntakeRevision } from '@corrida/types';
import { useProntuarioHistoryPages } from './useProntuarioHistoryPages';

export function ProntuarioHealthIntakeHistory({ alunoId, refreshToken, focusRevision }: {
  alunoId: string;
  refreshToken: unknown;
  focusRevision?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [alunoId, focusRevision]);
  const focused = Boolean(focusRevision && !showAll);
  const { events, loading, loadingMore, hasMore, error, loadMore, retry } =
    useProntuarioHistoryPages<ProntuarioHealthIntakeRevision>(
      alunoId ? `${alunoId}:${focused ? focusRevision : 'all'}` : null,
      refreshToken,
      (skip) => prontuarioService.healthIntakeHistory(alunoId, focused ? { revision: focusRevision, skip } : { skip }),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versões da Anamnese Inicial</CardTitle>
        <CardDescription>Respostas históricas da fonte clínica original, sem copiar dados para o prontuário.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {focused && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 p-3 text-sm">
            <span>Versão {focusRevision} da Anamnese Inicial selecionada no histórico.</span>
            <button type="button" className="font-medium text-primary underline" onClick={() => setShowAll(true)}>Ver todas as versões</button>
          </div>
        )}
        {loading && <p role="status" className="text-sm text-muted-foreground">Carregando Anamnese...</p>}
        {error && (
          <div role="alert" className="text-sm text-destructive">
            Não foi possível consultar as versões da Anamnese.
            <button type="button" className="ml-2 underline" onClick={events.length ? loadMore : retry}>Tentar novamente</button>
          </div>
        )}
        {!loading && !error && events.length === 0 && <p className="text-sm text-muted-foreground">{focused ? 'A versão original não está disponível para este aluno e perfil.' : 'Nenhuma versão disponível.'}</p>}
        {!loading && events.map((event) => (
          <details key={event.id} open={focused && event.revision === focusRevision} className="min-w-0 rounded-md border border-border p-3 text-sm">
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
