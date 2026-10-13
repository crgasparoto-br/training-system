import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { prontuarioService } from '../../services/prontuario.service';
import type { ProntuarioHistoryEntityType, ProntuarioHistoryEvent } from '@corrida/types';
import { useProntuarioHistoryPages } from './useProntuarioHistoryPages';

const categories = [
  { type: 'record', label: 'Resumo e observações', block: 'summary' },
  { type: 'goal', label: 'Objetivos', block: 'goals' },
  { type: 'anamnesisFollowUp', label: 'Anamnese e restrições', block: 'anamnesis' },
  { type: 'activityHistory', label: 'Atividades', block: 'activity' },
  { type: 'medicationProcedure', label: 'Medicamentos e procedimentos', block: 'meds' },
  { type: 'painCase', label: 'Dores e restrições', block: 'pain' },
  { type: 'painFollowUp', label: 'Acompanhamentos de dor', block: 'pain' },
  { type: 'discomfortSnapshot', label: 'Desconfortos', block: 'discomforts' },
] as const satisfies readonly { type: ProntuarioHistoryEntityType; label: string; block: string }[];

type PermissionBlock = (typeof categories)[number]['block'];

export function ProntuarioVersionHistory({
  recordId,
  allowed,
  refreshToken,
}: {
  recordId: string;
  allowed: Record<PermissionBlock, boolean>;
  refreshToken: unknown;
}) {
  const visible = categories.filter((category) => allowed[category.block]);
  const [category, setCategory] = useState<ProntuarioHistoryEntityType>('record');
  const selected = visible.some((entry) => entry.type === category) ? category : visible[0]?.type;
  const { events, loading, loadingMore, hasMore, error, loadMore, retry } =
    useProntuarioHistoryPages<ProntuarioHistoryEvent>(
      recordId && selected ? `${recordId}:${selected}` : null,
      refreshToken,
      (skip) => prontuarioService.history(recordId, selected!, { skip }),
    );

  if (!visible.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Versões do prontuário</CardTitle>
        <CardDescription>Consulte as alterações registradas sem substituir o estado atual.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="prnt-history-category">Tipo de informação</label>
        <select
          id="prnt-history-category"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={selected}
          onChange={(event) => setCategory(event.target.value as ProntuarioHistoryEntityType)}
        >
          {visible.map((entry) => <option key={entry.type} value={entry.type}>{entry.label}</option>)}
        </select>
        {loading && <p role="status" className="text-sm text-muted-foreground">Carregando versões...</p>}
        {error && (
          <div role="alert" className="text-sm text-destructive">
            Não foi possível carregar as versões. Confira sua permissão para este bloco.
            <button type="button" className="ml-2 underline" onClick={events.length ? loadMore : retry}>Tentar novamente</button>
          </div>
        )}
        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-muted-foreground">Ainda não há versões registradas nesta categoria.</p>
        )}
        {!loading && events.map((event) => (
          <details key={event.id} className="min-w-0 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Versão {event.version} · {event.action === 'baseline' ? 'Estado anterior' : event.action === 'created' ? 'Criação' : event.action === 'closed' ? 'Encerramento' : 'Atualização'}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString('pt-BR')} · Origem: {event.source}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">Registro: {event.entityId} · Autor: {event.actorUserId ?? 'Não identificado (legado)'}</p>
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
