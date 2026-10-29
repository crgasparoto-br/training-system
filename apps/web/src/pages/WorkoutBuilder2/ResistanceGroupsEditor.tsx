import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ResistanceGroupKind } from '../../services/workout.service';
import type { ResistanceGroupDraft, ResistedSectionKey } from './workout-builder-structure';

export interface GroupExerciseOption {
  id: string; name: string; section: ResistedSectionKey; category?: string;
}
interface Props {
  groups: ResistanceGroupDraft[];
  exercises: GroupExerciseOption[];
  onChange: (groups: ResistanceGroupDraft[]) => void;
  readOnly?: boolean;
}
const GROUP_TYPES: Array<{ kind: ResistanceGroupKind; title: string; min: number; max: number }> = [
  { kind: 'superserie', title: 'Supersérie', min: 2, max: 4 },
  { kind: 'bi_set', title: 'Bi-set', min: 2, max: 2 },
  { kind: 'tri_set', title: 'Tri-set', min: 3, max: 3 },
  { kind: 'circuito', title: 'Circuito', min: 2, max: 20 },
  { kind: 'bloco_tecnico', title: 'Bloco técnico', min: 1, max: 20 },
  { kind: 'mobilidade', title: 'Mobilidade', min: 1, max: 20 },
  { kind: 'finalizacao', title: 'Finalização', min: 1, max: 20 },
];
const sectionLabel: Record<ResistedSectionKey, string> = {
  mobilidade: 'Mobilidade', sessao: 'Sessão', resfriamento: 'Finalização',
};
const buttonStyle = 'inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40';
const inputStyle = 'min-h-10 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function ResistanceGroupsEditor({ groups, exercises, onChange, readOnly = false }: Props) {
  const headingId = useId();
  const [newKind, setNewKind] = useState<ResistanceGroupKind>('bi_set');
  const [feedback, setFeedback] = useState<string | null>(null);
  const used = new Set(groups.flatMap((group) => group.members.map((member) => member.exerciseRowId)));
  // Never synthesize an arrangement from free-text system names or cyclic exercises.
  const available = exercises.filter((exercise) => !used.has(exercise.id)
    && exercise.category?.toLowerCase() !== 'cíclico' && exercise.category?.toLowerCase() !== 'ciclico');

  const emit = (next: ResistanceGroupDraft[]) => {
    if (readOnly) return;
    setFeedback(null);
    onChange(next.map((group, index) => ({ ...group, position: index + 1 })));
  };
  const change = (index: number, group: ResistanceGroupDraft) =>
    emit(groups.map((item, cursor) => cursor === index ? group : item));

  const addGroup = () => {
    if (readOnly) return;
    const kind = GROUP_TYPES.find((type) => type.kind === newKind)!;
    if (available.length < kind.min) {
      setFeedback(`Adicione ${kind.min} exercícios livres antes de criar ${kind.title.toLowerCase()}.`);
      return;
    }
    emit([...groups, {
      position: groups.length + 1,
      kind: kind.kind,
      rounds: null,
      restBetweenExercisesSec: null,
      restBetweenRoundsSec: null,
      notes: null,
      members: available.slice(0, kind.min).map((exercise) => ({ exerciseRowId: exercise.id })),
    }]);
  };

  const changeKind = (index: number, kind: ResistanceGroupKind) => {
    if (readOnly) return;
    const limit = GROUP_TYPES.find((type) => type.kind === kind)!;
    const group = groups[index];
    if (group.members.length > limit.max) {
      setFeedback(`Remova participantes antes de escolher ${limit.title.toLowerCase()}.`);
      return;
    }
    const deficit = Math.max(0, limit.min - group.members.length);
    if (deficit > available.length) {
      setFeedback(`São necessários ${limit.min} participantes para ${limit.title.toLowerCase()}.`);
      return;
    }
    change(index, {
      ...group, kind, members: [
        ...group.members,
        ...available.slice(0, deficit).map((exercise) => ({ exerciseRowId: exercise.id })),
      ],
    });
  };

  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    emit(next);
  };

  const moveMember = (groupIndex: number, memberIndex: number, direction: -1 | 1) => {
    const group = groups[groupIndex];
    const target = memberIndex + direction;
    if (target < 0 || target >= group.members.length) return;
    const members = [...group.members];
    [members[memberIndex], members[target]] = [members[target], members[memberIndex]];
    change(groupIndex, { ...group, members });
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/30 p-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h5 id={headingId} className="text-sm font-semibold text-foreground">Agrupamentos de exercícios</h5>
          <p className="mt-1 text-xs text-muted-foreground">
            Combine exercícios existentes em superséries, bi-sets, tri-sets e circuitos sem duplicar a prescrição.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">Tipo de novo grupo</span>
            <select className={inputStyle} value={newKind} disabled={readOnly}
              onChange={(event) => setNewKind(event.target.value as ResistanceGroupKind)}>
              {GROUP_TYPES.map((type) => <option key={type.kind} value={type.kind}>{type.title}</option>)}
            </select>
          </label>
          <button type="button" className={buttonStyle} onClick={addGroup}
            disabled={readOnly || available.length < GROUP_TYPES.find((type) => type.kind === newKind)!.min}>
            <Plus size={15} aria-hidden="true" /> Criar grupo
          </button>
        </div>
      </div>
      {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
      {available.length < GROUP_TYPES.find((type) => type.kind === newKind)!.min && (
        <p className="text-xs text-muted-foreground">Para criar {GROUP_TYPES.find((type) => type.kind === newKind)!.title.toLowerCase()},
          adicione pelo menos {GROUP_TYPES.find((type) => type.kind === newKind)!.min} exercícios livres ao dia.</p>
      )}
      {groups.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
          Nenhum agrupamento estruturado neste dia. Os exercícios individuais permanecem inalterados.
        </p>
      )}
      <ol className="space-y-3">
        {groups.map((group, index) => {
          const kind = GROUP_TYPES.find((entry) => entry.kind === group.kind) ?? GROUP_TYPES[0];
          return (
            <li key={index} className="space-y-3 rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[11rem] flex-1 text-xs text-muted-foreground">
                  <span className="mb-1 block">Grupo {index + 1} · Tipo</span>
                  <select className={inputStyle} value={group.kind}
                    onChange={(event) => changeKind(index, event.target.value as ResistanceGroupKind)}>
                    {GROUP_TYPES.map((entry) => <option key={entry.kind} value={entry.kind}>{entry.title}</option>)}
                  </select>
                </label>
                <button type="button" className={buttonStyle} disabled={index === 0}
                  aria-label={`Mover grupo ${index + 1} para cima`} onClick={() => moveGroup(index, -1)}>
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button type="button" className={buttonStyle} disabled={index === groups.length - 1}
                  aria-label={`Mover grupo ${index + 1} para baixo`} onClick={() => moveGroup(index, 1)}>
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
                <button type="button" className={buttonStyle} onClick={() => emit(groups.filter((_, i) => i !== index))}
                  aria-label={`Excluir grupo ${index + 1}`}>
                  <Trash2 size={15} aria-hidden="true" /> Desfazer grupo
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Participantes em ordem ({group.members.length}) · {kind.min === kind.max
                    ? `exatamente ${kind.min}` : `de ${kind.min} a ${kind.max}`} exercícios
                </p>
                <ol className="space-y-1.5">
                  {group.members.map((member, memberIndex) => {
                    const exercise = exercises.find((row) => row.id === member.exerciseRowId);
                    return (
                      <li key={member.exerciseRowId} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
                        <label className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
                          <span className="mb-1 block">Participante {memberIndex + 1} do grupo {index + 1}</span>
                          <select className={inputStyle} value={member.exerciseRowId} onChange={(event) => {
                            if (!event.target.value || event.target.value === member.exerciseRowId) return;
                            change(index, { ...group, members: group.members.map((entry, position) =>
                              position === memberIndex ? { exerciseRowId: event.target.value } : entry,
                            ) });
                          }}>
                            {!exercise && <option value={member.exerciseRowId} disabled>Exercício indisponível</option>}
                            {[...(exercise ? [exercise] : []), ...available].map((option) =>
                              <option key={option.id} value={option.id}>
                                {option.name} · {sectionLabel[option.section]}
                              </option>)}
                          </select>
                        </label>
                        <button type="button" className={buttonStyle} disabled={memberIndex === 0}
                          aria-label={`Subir participante ${memberIndex + 1} do grupo ${index + 1}`}
                          onClick={() => moveMember(index, memberIndex, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                        <button type="button" className={buttonStyle} disabled={memberIndex === group.members.length - 1}
                          aria-label={`Descer participante ${memberIndex + 1} do grupo ${index + 1}`}
                          onClick={() => moveMember(index, memberIndex, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                        <button type="button" className={buttonStyle} disabled={group.members.length <= kind.min}
                          aria-label={`Remover participante ${memberIndex + 1} do grupo ${index + 1}`}
                          onClick={() => change(index, { ...group,
                            members: group.members.filter((_, i) => i !== memberIndex),
                          })}><Trash2 size={14} aria-hidden="true" /></button>
                      </li>
                    );
                  })}
                </ol>
                {group.members.length < kind.max && available.length > 0 && (
                  <label className="mt-2 block max-w-md text-xs text-muted-foreground">
                    <span className="mb-1 block">Adicionar participante disponível</span>
                    <select className={inputStyle} value="" onChange={(event) => {
                      if (!event.target.value) return;
                      change(index, { ...group, members: [...group.members, { exerciseRowId: event.target.value }] });
                    }}>
                      <option value="">Selecione um exercício</option>
                      {available.map((exercise) => <option key={exercise.id} value={exercise.id}>
                        {exercise.name} · {sectionLabel[exercise.section]}
                      </option>)}
                    </select>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {([
                  ['rounds', 'Rodadas (opcional)', 1, 100],
                  ['restBetweenExercisesSec', 'Descanso entre exercícios (s)', 0, 86400],
                  ['restBetweenRoundsSec', 'Descanso entre rodadas (s)', 0, 86400],
                ] as const).map(([key, title, min, max]) => (
                  <label key={key} className="text-xs text-muted-foreground">
                    <span className="mb-1 block">{title}</span>
                    <input className={inputStyle} type="number" min={min} max={max} step={1}
                      value={group[key] ?? ''} onChange={(event) => change(index, {
                        ...group, [key]: event.target.value === '' ? null : Number(event.target.value),
                      })} />
                  </label>
                ))}
              </div>
              <label className="block text-xs text-muted-foreground">
                <span className="mb-1 block">Observações do grupo</span>
                <textarea className={inputStyle} rows={2} maxLength={500} value={group.notes ?? ''}
                  onChange={(event) => change(index, { ...group, notes: event.target.value || null })} />
              </label>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
