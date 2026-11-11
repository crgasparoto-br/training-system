import { useEffect, useRef, useState } from 'react';
import type {
  TrainingRoutineAudience,
  TrainingRoutineSessionDetail,
  TrainingRoutineSessionSummary,
  TrainingSubstitutionAlternative,
  TrainingSubstitutionKind,
  TrainingSubstitutionRecord,
} from '@corrida/types';
import { Button } from '../ui/Button';
import { trainingRoutineService } from '../../services/training-routine.service';

const contextLabel = {
  planning: 'Aprovada antes do treino (planejamento)',
  review: 'Aprovada antes do treino (revisão)',
  execution: 'Registrada durante a execução',
} as const;
const statusLabel = {
  approved: 'Aprovada pelo professor',
  pending_review: 'Aguardando revisão do professor',
  rejected: 'Rejeitada na revisão',
} as const;

type Props = {
  session: TrainingRoutineSessionDetail | TrainingRoutineSessionSummary;
  audience: TrainingRoutineAudience;
  contractId?: string | null;
  onChanged?: () => Promise<void>;
  /** Capacidade profissional independente da permissao de leitura dos treinos. */
  canManage?: boolean;
};

/** O item liberado continua intacto: o form apenas registra o vinculo auditavel. */
export function TrainingSubstitutionCard({ session, audience, contractId, onChanged, canManage = false }: Props) {
  const isDetail = 'blocks' in session;
  const exercises = isDetail ? session.blocks.flatMap(block => block.exercises) : session.substitutionExercises ?? [];
  const execution = 'execution' in session ? session.execution : undefined;
  const [kind, setKind] = useState<TrainingSubstitutionKind>(exercises.length ? 'exercise' : 'session');
  const [originalId, setOriginalId] = useState(exercises[0]?.id ?? session.sessionId);
  const [alternatives, setAlternatives] = useState<TrainingSubstitutionAlternative[]>([]);
  const [search, setSearch] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const [replacementId, setReplacementId] = useState('');
  const [reason, setReason] = useState('');
  const [preapprovalContext, setPreapprovalContext] = useState<'planning' | 'review'>('planning');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const operation = useRef<{ signature: string; key: string } | null>(null);
  const readVersion = useRef(0);

  useEffect(() => {
    readVersion.current += 1;
    operation.current = null;
    setAlternatives([]);
    setNextOffset(null);
    setSearch('');
    setRefreshPending(false);
    setReplacementId('');
    setReason('');
    setPreapprovalContext('planning');
    setError(null);
    setMessage(null);
  }, [session.sessionId]);

  const records: TrainingSubstitutionRecord[] = session.substitutions ?? [];
  const canCreate = !refreshPending && ((audience === 'professor' && canManage && session.status === 'not_started')
    || (audience === 'student' && isDetail && execution?.status === 'in_progress'));
  const selectedAlternative = alternatives.find(item => item.replacement.id === replacementId);

  const resetOptions = (nextKind: TrainingSubstitutionKind, nextOriginalId: string) => {
    readVersion.current += 1;
    setKind(nextKind);
    setOriginalId(nextOriginalId);
    setAlternatives([]);
    setNextOffset(null);
    setSearch('');
    setReplacementId('');
    setMessage(null);
    setError(null);
    operation.current = null;
  };

  const loadAlternatives = async (more = false) => {
    if (busy || !canCreate || (more && nextOffset === null)) return;
    const request = ++readVersion.current;
    setBusy(true);
    setError(null);
    setMessage(null);
    if (!more) {
      setAlternatives([]);
      setReplacementId('');
      setNextOffset(null);
    }
    try {
      const found = await trainingRoutineService.getSubstitutionAlternatives(
        session.sessionId, kind, kind === 'session' ? session.sessionId : originalId,
        audience === 'student' ? contractId ?? undefined : undefined,
        { search, offset: more ? nextOffset! : 0 },
      );
      if (readVersion.current !== request) return;
      setAlternatives(previous => more
        ? [...previous, ...found.items.filter(item =>
          !previous.some(loaded => loaded.replacement.id === item.replacement.id))]
        : found.items);
      setNextOffset(found.nextOffset);
      if (!more && found.items.length === 0) {
        setMessage('Nenhuma alternativa elegível foi encontrada neste contrato.');
      }
    } catch {
      if (readVersion.current === request) setError('Não foi possível consultar alternativas. Atualize o treino.');
    } finally {
      if (readVersion.current === request) setBusy(false);
    }
  };

  // Once the API confirms a write, a subsequent read failure must never be
  // presented as a failed write or invite a second mutation on stale data.
  const refreshAfterConfirmedChange = async (confirmation: string) => {
    setMessage(confirmation);
    if (!onChanged) return;
    setRefreshPending(true);
    try {
      await onChanged();
      setRefreshPending(false);
    } catch {
      setMessage(confirmation + ' Os dados da tela não foram atualizados. Atualize o histórico antes de outra alteração.');
    }
  };

  const retryRefresh = async () => {
    if (busy || !refreshPending || !onChanged) return;
    setBusy(true);
    try {
      await onChanged();
      setRefreshPending(false);
      setMessage('Histórico atualizado. A alteração anterior já estava salva.');
    } catch {
      setMessage('A alteração está salva, mas a atualização do histórico ainda falhou. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!canCreate || busy || !selectedAlternative || reason.trim().length < 3) {
      setError('Selecione uma alternativa e informe o motivo da troca.');
      return;
    }
    if (audience === 'student' && execution?.version === undefined) {
      setError('Atualize a sessão antes de registrar uma troca.');
      return;
    }
    const signature = JSON.stringify([
      session.sessionId, kind, originalId, replacementId, reason.trim(),
      audience, preapprovalContext, execution?.version ?? null,
    ]);
    if (operation.current?.signature !== signature) {
      operation.current = { signature, key: crypto.randomUUID() };
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await trainingRoutineService.createSubstitution(session.sessionId, {
        kind, context: audience === 'professor' ? preapprovalContext : 'execution',
        originalUnitId: kind === 'session' ? session.sessionId : originalId,
        replacementUnitId: replacementId, reason: reason.trim(),
        operationKey: operation.current.key,
        ...(audience === 'student' ? { expectedExecutionVersion: execution!.version } : {}),
      }, audience === 'student' ? contractId ?? undefined : undefined);
      setAlternatives([]);
      setNextOffset(null);
      setReplacementId('');
      setReason('');
      operation.current = null;
      await refreshAfterConfirmedChange(audience === 'student'
        ? 'Troca registrada. O professor poderá revisá-la.'
        : 'Alternativa aprovada. O planejamento original foi preservado.');
    } catch {
      setError('Não foi possível registrar. A sessão ou o catálogo pode ter mudado; atualize e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const review = async (item: TrainingSubstitutionRecord, action: 'approve' | 'reject') => {
    if (audience !== 'professor' || !canManage || busy || refreshPending) return;
    const explanation = reviewReasons[item.id]?.trim() ?? '';
    if (action === 'reject' && explanation.length < 3) {
      setError('Informe o motivo para rejeitar a substituição.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await trainingRoutineService.reviewSubstitution(session.sessionId, item.id, {
        action, expectedVersion: item.version,
        ...(explanation ? { reason: explanation } : {}),
      });
      await refreshAfterConfirmedChange(action === 'approve'
        ? 'Substituição aprovada.' : 'Substituição rejeitada.');
    } catch {
      setError('Não foi possível revisar. Atualize a sessão e confira se já houve outra decisão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Substituições rastreáveis" className="space-y-3 rounded-lg border border-border bg-background p-3 sm:p-4">
      <h4 className="text-sm font-semibold text-foreground">Substituições da sessão</h4>
      <p className="text-xs text-muted-foreground">
        As trocas são registradas com motivo, responsável e versão. O treino originalmente liberado não é alterado.
        A seleção de alternativa não significa aprovação automática.
      </p>
      {records.length > 0 ? (
        <ol className="space-y-2" aria-label="Histórico de substituições">
          {records.map(item => (
            <li key={item.id} className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium text-foreground">{item.original.name} → {item.replacement.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.kind === 'session' ? 'Sessão' : 'Exercício'} · {contextLabel[item.context]} · {statusLabel[item.status]}
              </p>
              <p className="text-xs text-muted-foreground">
                Original: {item.originalVersion} · Substituto: {item.replacementVersion}
              </p>
              <p className="text-sm">Motivo: {item.reason}</p>
              <p className="text-xs text-muted-foreground">
                Responsável: {item.actorUserId} · {new Date(item.createdAt).toLocaleString('pt-BR')}
                {item.reviewedAt ? ' · Revisão: ' + new Date(item.reviewedAt).toLocaleString('pt-BR') : ''}
              </p>
              {item.reviewReason && <p className="text-xs text-muted-foreground">Parecer: {item.reviewReason}</p>}
              {audience === 'professor' && canManage && item.context === 'execution' && item.status === 'pending_review' && (
                <div className="space-y-2 border-t border-border pt-2">
                  <label className="block text-xs font-medium" htmlFor={'review-' + item.id}>
                    Motivo da decisão (obrigatório para rejeição)
                  </label>
                  <input
                    id={'review-' + item.id} type="text" maxLength={500}
                    value={reviewReasons[item.id] ?? ''}
                    onChange={event => setReviewReasons(prev => ({ ...prev, [item.id]: event.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={busy || refreshPending} onClick={() => void review(item, 'approve')}>
                      Aprovar troca registrada
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy || refreshPending}
                      onClick={() => void review(item, 'reject')}>
                      Rejeitar troca
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-muted-foreground">Nenhuma substituição registrada.</p>}

      {canCreate && (
        <div className="space-y-3 border-t border-border pt-3">
          <h5 className="text-sm font-semibold">
            {audience === 'professor' ? 'Aprovar alternativa antes do treino' : 'Registrar troca durante o treino'}
          </h5>
          {audience === 'professor' && (
            <label className="block space-y-1 text-xs font-medium">
              <span>Momento da aprovação</span>
              <select value={preapprovalContext} disabled={busy}
                onChange={event => {
                  setPreapprovalContext(event.target.value as 'planning' | 'review');
                  operation.current = null;
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                <option value="planning">Planejamento</option>
                <option value="review">Revisão antes da execução</option>
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              <span>Tipo de substituição</span>
              <select
                value={kind} disabled={busy}
                onChange={event => {
                  const value = event.target.value as TrainingSubstitutionKind;
                  resetOptions(value, value === 'session' ? session.sessionId : exercises[0]?.id ?? session.sessionId);
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                {exercises.length > 0 && <option value="exercise">Exercício</option>}
                <option value="session">Sessão</option>
              </select>
            </label>
            {kind === 'exercise' && (
              <label className="space-y-1 text-xs font-medium">
                <span>Exercício planejado</span>
                <select value={originalId} disabled={busy}
                  onChange={event => resetOptions('exercise', event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  {exercises.map(item => <option key={item.id} value={item.id}>{item.name} (planejado)</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="block space-y-1 text-xs font-medium">
            <span>Buscar alternativa</span>
            <input type="search" value={search} maxLength={100} disabled={busy}
              placeholder={kind === 'exercise' ? 'Nome ou alias do exercício' : 'Data (AAAA-MM-DD)'}
              onChange={event => {
                readVersion.current += 1;
                setSearch(event.target.value);
                setAlternatives([]);
                setNextOffset(null);
                setReplacementId('');
                operation.current = null;
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm" />
          </label>
          <Button type="button" size="sm" variant="outline" disabled={busy || !originalId}
            onClick={() => void loadAlternatives()}>
            Buscar alternativas elegíveis
          </Button>
          {alternatives.length > 0 && (
            <label className="block space-y-1 text-xs font-medium">
              <span>Substituto</span>
              <select value={replacementId} disabled={busy}
                onChange={event => { setReplacementId(event.target.value); operation.current = null; }}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                <option value="">Selecione uma alternativa</option>
                {alternatives.map(item => (
                  <option key={item.replacement.id} value={item.replacement.id}>
                    {item.replacement.name} · {item.replacement.version}
                    {item.suitability.sameMovementPattern ? ' · mesmo padrão de movimento' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {nextOffset !== null && (
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={() => void loadAlternatives(true)}>
              Carregar mais alternativas
            </Button>
          )}
          {selectedAlternative && (
            <p className="text-xs text-muted-foreground">
              Padrão de movimento: {selectedAlternative.suitability.sameMovementPattern ? 'coincidente' : 'não confirmado como equivalente'}
              {' · '}Equipamentos em comum: {selectedAlternative.suitability.sharedEquipment.join(', ') || 'não identificados'}
              {selectedAlternative.suitability.requiresProfessionalReview ? ' · Requer avaliação profissional de restrições' : ''}
              {selectedAlternative.objectiveHint ? ' · Objetivo informado: ' + selectedAlternative.objectiveHint : ''}
            </p>
          )}
          {selectedAlternative && (
            <label className="block space-y-1 text-xs font-medium">
              <span>Motivo obrigatório</span>
              <textarea value={reason} maxLength={500} rows={2} disabled={busy}
                onChange={event => { setReason(event.target.value); operation.current = null; }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Explique por que a troca é necessária" />
            </label>
          )}
          {selectedAlternative && (
            <Button type="button" disabled={busy || reason.trim().length < 3}
              onClick={() => void create()}>
              {audience === 'professor' ? 'Aprovar alternativa' : 'Registrar troca para revisão'}
            </Button>
          )}
        </div>
      )}
      {refreshPending && (
        <div className="space-y-2 rounded-md border border-border p-3" role="status">
          <p className="text-sm">A alteração foi salva, mas a tela precisa atualizar os dados antes de outra ação.</p>
          <Button type="button" size="sm" variant="outline" disabled={busy}
            onClick={() => void retryRefresh()}>Atualizar histórico</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
