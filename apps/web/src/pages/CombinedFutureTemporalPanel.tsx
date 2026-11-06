import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, RefreshCcw } from 'lucide-react';
import type {
  ConsolidatedCombinedReviewSnapshot,
  FutureTemporalBookingCandidate,
  FutureTemporalPreview,
  FutureTemporalPreviewCommand,
} from '@corrida/types';
import { Button } from '../components/ui/Button';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';

const reasonLabels = {
  invalid_source_date: 'A data armazenada na agenda não é uma data civil UTC canônica.',
  invalid_local_range: 'O horário registrado na agenda é inválido.',
  nonexistent_local_time: 'O horário não existe nesse fuso devido à mudança de relógio.',
  ambiguous_local_time: 'O horário ocorre mais de uma vez nesse fuso devido à mudança de relógio.',
} as const;
type Props = {
  alunoId: string;
  contractId: string | null;
  summary: ConsolidatedCombinedReviewSnapshot | null;
  currentVersion: number | null;
  canReadAgenda: boolean;
  authorizationKey: string;
  dirty: boolean;
};

function rangeNow() {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}
function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
export function CombinedFutureTemporalPanel({
  alunoId, contractId, summary, currentVersion, canReadAgenda, authorizationKey, dirty,
}: Props) {
  const actualSummary = summary?.assemblyVersion === currentVersion ? summary : null;
  const identity = JSON.stringify([
    alunoId, contractId, actualSummary?.assemblyVersionId, currentVersion, authorizationKey, canReadAgenda,
  ]);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const sequence = useRef(0);
  const [candidates, setCandidates] = useState<{ identity: string; range: { start: string; end: string }; rows: FutureTemporalBookingCandidate[] } | null>(null);
  const [preview, setPreview] = useState<{ identity: string; report: FutureTemporalPreview } | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const [timeZoneConfirmed, setTimeZoneConfirmed] = useState(false);
  const [loading, setLoading] = useState<'list' | 'preview' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = candidates?.identity === identity && canReadAgenda ? candidates : null;
  const result = preview?.identity === identity && canReadAgenda ? preview.report : null;

  useEffect(() => {
    sequence.current += 1;
    setCandidates(null);
    setPreview(null);
    setChoices([]);
    setTimeZoneConfirmed(false);
    setError(null);
    setLoading(null);
    return () => { sequence.current += 1; };
  }, [identity]);

  const load = async () => {
    if (!canReadAgenda || !actualSummary || dirty || loading) return;
    const id = ++sequence.current;
    const range = rangeNow();
    setCandidates(null); setChoices([]); setPreview(null); setError(null); setLoading('list');
    try {
      const rows = await consolidatedPrescriptionService.getFutureBookingCandidates(alunoId, range.start, range.end);
      if (id === sequence.current && latestIdentity.current === identity) {
        setCandidates({ identity, range, rows });
      }
    } catch {
      if (id === sequence.current && latestIdentity.current === identity) {
        setError('Não foi possível consultar a agenda. Revise o acesso e tente novamente.');
      }
    } finally {
      if (id === sequence.current && latestIdentity.current === identity) setLoading(null);
    }
  };
  const toggle = (key: string, checked: boolean) => {
    setChoices((prior) => checked ? [...prior.filter((item) => item !== key), key] : prior.filter((item) => item !== key));
    setPreview(null);
  };
  const evaluate = async () => {
    if (!current || !actualSummary || !canReadAgenda || !timeZoneConfirmed || dirty || loading) return;
    const id = ++sequence.current;
    setError(null); setPreview(null); setLoading('preview');
    const bindings: FutureTemporalPreviewCommand['bindings'] = [];
    for (const item of current.rows) {
      for (const source of actualSummary.capacitySources) {
        if (choices.includes(item.bookingId + ':' + source.capacityPrescriptionVersionId)) {
          bindings.push({
            bookingId: item.bookingId,
            capacityPrescriptionVersionId: source.capacityPrescriptionVersionId,
            expectedBookingUpdatedAt: item.sourceUpdatedAt,
          });
        }
      }
    }
    try {
      const report = await consolidatedPrescriptionService.previewFutureTemporal(alunoId, {
        expectedCurrentVersion: actualSummary.assemblyVersion,
        windowStart: current.range.start, windowEnd: current.range.end,
        timeZone, bindings,
      });
      if (id === sequence.current && latestIdentity.current === identity) setPreview({ identity, report });
    } catch {
      if (id === sequence.current && latestIdentity.current === identity) {
        setError('As fontes, versões ou permissões mudaram. Recarregue a agenda antes de nova avaliação.');
        setCandidates(null); setChoices([]);
      }
    } finally {
      if (id === sequence.current && latestIdentity.current === identity) setLoading(null);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-border bg-muted/10 p-4" aria-label="Avaliação temporal futura">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Avaliação temporal das sessões futuras</h3>
          <p className="text-xs text-muted-foreground">
            A agenda não identifica a capacidade por si só. Associe cada agendamento à prescrição correta e
            confirme o fuso da agenda para verificar horários. A associação é válida apenas nesta prévia;
            não cria treino, modifica agenda, aprova nem libera a montagem.
          </p>
          {!actualSummary ? (
            <p className="text-sm text-muted-foreground">Salve e recarregue a montagem para verificar sua versão.</p>
          ) : !canReadAgenda ? (
            <p className="text-sm text-muted-foreground">
              A avaliação futura exige acesso à Montagem e à Agenda. Nenhum agendamento foi consultado.
            </p>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm"
                disabled={dirty || loading !== null} isLoading={loading === 'list'}
                loadingText="Consultando agenda..." onClick={() => { void load(); }}>
                <RefreshCcw size={15} aria-hidden="true" />
                {current ? 'Recarregar agendamentos futuros' : 'Consultar agendamentos futuros'}
              </Button>
              {dirty && <p className="text-xs text-amber-900">Salve as alterações locais antes de avaliar horários futuros.</p>}
              {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
              {current && (
                <div className="space-y-3 border-t border-border pt-3">
                  {current.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum agendamento futuro está registrado no período. Não é possível avaliar intervalos.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {current.rows.map((booking) => (
                        <fieldset key={booking.bookingId} className="rounded-md border border-border bg-background p-3">
                          <legend className="px-1 text-sm font-medium">
                            {booking.bookingDate} • {booking.startTime}–{booking.endTime}
                          </legend>
                          <p className="mb-2 text-xs text-muted-foreground">Agendamento: {booking.bookingId} • Versão {booking.sourceUpdatedAt}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {actualSummary.capacitySources.map((source) => {
                              const key = booking.bookingId + ':' + source.capacityPrescriptionVersionId;
                              return (
                                <label key={key} className="flex items-center gap-2 text-xs">
                                  <input type="checkbox" checked={choices.includes(key)}
                                    onChange={(e) => toggle(key, e.target.checked)} disabled={dirty || loading !== null}
                                  />
                                  {source.capacity} v{source.capacityVersion}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  )}
                  <label className="block text-sm font-medium" htmlFor="future-temporal-time-zone">
                    Fuso IANA da agenda (confirmação profissional)
                  </label>
                  <input id="future-temporal-time-zone" type="text"
                    className="ts-input w-full max-w-xs"
                    value={timeZone} maxLength={90}
                    onChange={(e) => { setTimeZone(e.target.value); setTimeZoneConfirmed(false); setPreview(null); }}
                  />
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={timeZoneConfirmed} onChange={(e) => {
                      setTimeZoneConfirmed(e.target.checked); setPreview(null);
                    }} />
                    Confirmei que o fuso IANA informado corresponde à agenda destes agendamentos.
                  </label>
                  <Button type="button" size="sm" variant="outline"
                    disabled={dirty || loading !== null || !timeZoneConfirmed}
                    isLoading={loading === 'preview'} loadingText="Conferindo..."
                    onClick={() => { void evaluate(); }}>
                    <CalendarClock size={15} aria-hidden="true" /> Conferir intervalos futuros
                  </Button>
                  {result && (
                    <div role="status" className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
                        <p className="text-sm font-semibold">
                          {result.state === 'no_active_rules'
                            ? 'Regras clínicas ainda não ativas — sem conclusão de segurança'
                            : 'Prévia temporal: dados parciais, sem autorização automática'}
                        </p>
                      </div>
                      <p className="text-xs">
                        Versão da montagem v{result.assemblyVersion} • Fuso assumido: {result.timeZone}
                        {' • '}Cobertura parcial, independentemente dos vínculos apresentados.
                      </p>
                      {result.mappedSessions.map((item) => (
                        <p key={item.bookingId + ':' + item.capacityPrescriptionVersionId} className="break-all text-xs">
                          {item.capacity} v{item.capacityVersion} • Agendamento {item.bookingId} • Fonte {item.bookingVersion}
                          {' • '}{item.proof === 'verified'
                            ? item.startAtUtc + ' — ' + item.endAtUtc
                            : 'Horário não comprovado: ' + reasonLabels[item.proof]}
                        </p>
                      ))}
                      {result.gaps.map((gap) => (
                        <p key={gap.previousBookingId + ':' + gap.nextBookingId} className="text-xs">
                          Intervalo observado entre agendamentos: {gap.hoursFromEndToStart} h
                          {gap.overlapsInTime ? ' (sobreposição cronológica)' : ''}
                          {' • '}sem classificação clínica
                        </p>
                      ))}
                      {result.unlinkedCapacities.length > 0 && (
                        <p className="text-xs text-amber-900">
                          Capacidades sem horário vinculado e comprovado: {result.unlinkedCapacities.join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-amber-900">
                        O fuso não é cadastrado como autoridade do contrato e a seleção não é persistida.
                        Horários comprovados se referem apenas aos agendamentos vinculados nesta consulta;
                        outros treinos podem existir. Não conclua que não há riscos.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
