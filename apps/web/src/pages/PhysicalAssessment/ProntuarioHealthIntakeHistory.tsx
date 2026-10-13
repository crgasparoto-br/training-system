import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { prontuarioService } from '../../services/prontuario.service';
import type { ProntuarioHealthIntakeRevision } from '@corrida/types';

export function ProntuarioHealthIntakeHistory({ alunoId, refreshToken }: {
  alunoId: string;
  refreshToken: unknown;
}) {
  const [events, setEvents] = useState<ProntuarioHealthIntakeRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alunoId) {
      setEvents([]);
      return;
    }
    let active = true;
    setEvents([]);
    setError(null);
    setLoading(true);
    prontuarioService.healthIntakeHistory(alunoId)
      .then((rows) => { if (active) setEvents(rows); })
      .catch(() => { if (active) setError('Não foi possível consultar as versões da Anamnese.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [alunoId, refreshToken]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versões da Anamnese Inicial</CardTitle>
        <CardDescription>Respostas históricas da fonte clínica original, sem copiar dados para o prontuário.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p role="status" className="text-sm text-muted-foreground">Carregando Anamnese...</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !error && events.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão disponível.</p>}
        {!loading && !error && events.map((event) => (
          <details key={event.id} className="min-w-0 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Versão {event.revision} · {new Date(event.createdAt).toLocaleString('pt-BR')}</summary>
            <p className="mt-2 text-xs text-muted-foreground">Origem: {event.sourceType} · Formulário: {event.formVersion ?? 'não informado'}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">Autor: {event.actorUserId ?? 'Não identificado (legado)'}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-xs">{JSON.stringify(event.snapshot, null, 2)}</pre>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
