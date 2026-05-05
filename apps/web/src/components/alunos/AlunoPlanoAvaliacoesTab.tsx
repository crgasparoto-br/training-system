import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  alunoService,
  type AlunoAssessmentPlan,
  type AlunoAssessmentPlanItem,
  type AlunoAssessmentPlanStatus,
} from '../../services/aluno.service';
import type { AssessmentType } from '../../services/assessment-type.service';
import { formatDateBR } from '../../utils/date';

type AlunoPlanoAvaliacoesTabProps = {
  alunoId: string;
  assessmentTypes: AssessmentType[];
};

type PlanFormItem = {
  assessmentTypeId: string;
  assessmentTypeName: string;
  assessmentTypeCode: string;
  isActive: boolean;
  isRequired: boolean;
  cadenceMonths: string;
  startDate: string;
  nextDueDate: string;
  notes: string;
  lastAssessmentDate: string | null;
};

const toInputDate = (value: string | null) => (value ? value.slice(0, 10) : '');

const statusLabelMap: Record<AlunoAssessmentPlanStatus, string> = {
  em_dia: 'Em dia',
  pendente: 'Pendente',
  vencida: 'Vencida',
  sem_planejamento: 'Sem planejamento',
};

const statusClassMap: Record<AlunoAssessmentPlanStatus, string> = {
  em_dia: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pendente: 'border-amber-200 bg-amber-50 text-amber-700',
  vencida: 'border-rose-200 bg-rose-50 text-rose-700',
  sem_planejamento: 'border-slate-200 bg-slate-100 text-slate-700',
};

const mapPlanItemToForm = (item: AlunoAssessmentPlanItem): PlanFormItem => ({
  assessmentTypeId: item.assessmentTypeId,
  assessmentTypeName: item.assessmentType.name,
  assessmentTypeCode: item.assessmentType.code,
  isActive: item.isActive,
  isRequired: item.isRequired,
  cadenceMonths: item.cadenceMonths ? String(item.cadenceMonths) : '',
  startDate: toInputDate(item.startDate),
  nextDueDate: toInputDate(item.nextDueDate),
  notes: item.notes ?? '',
  lastAssessmentDate: item.summary.lastAssessmentDate,
});

const inferStatus = (item: PlanFormItem): AlunoAssessmentPlanStatus => {
  if (!item.isActive) {
    return 'sem_planejamento';
  }

  if (!item.nextDueDate) {
    return 'pendente';
  }

  const dueDate = new Date(item.nextDueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return 'pendente';
  }

  const today = new Date();
  const todayAtStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueAtStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  return dueAtStart < todayAtStart ? 'vencida' : 'em_dia';
};

export function AlunoPlanoAvaliacoesTab({ alunoId, assessmentTypes }: AlunoPlanoAvaliacoesTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [items, setItems] = useState<PlanFormItem[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const activeTypeCount = useMemo(
    () => assessmentTypes.filter((item) => item.isActive).length,
    [assessmentTypes]
  );

  const hydrateFromPlan = (plan: AlunoAssessmentPlan) => {
    const nextItems = plan.items.map(mapPlanItemToForm);
    setItems(nextItems);
  };

  const loadPlan = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const plan = await alunoService.getAssessmentPlan(alunoId);
      hydrateFromPlan(plan);
    } catch (error) {
      console.error('Erro ao carregar plano de avaliações:', error);
      setFeedback({
        type: 'error',
        message: 'Não foi possível carregar o plano de avaliações deste aluno.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [alunoId]);

  const updateItem = (assessmentTypeId: string, changes: Partial<PlanFormItem>) => {
    setItems((current) =>
      current.map((item) =>
        item.assessmentTypeId === assessmentTypeId
          ? {
              ...item,
              ...changes,
            }
          : item
      )
    );
  };

  const handleSave = async () => {
    if (items.length === 0) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const plan = await alunoService.saveAssessmentPlan(alunoId, {
        items: items.map((item) => ({
          assessmentTypeId: item.assessmentTypeId,
          isActive: item.isActive,
          isRequired: item.isRequired,
          cadenceMonths: item.cadenceMonths ? Number(item.cadenceMonths) : null,
          startDate: item.startDate || null,
          nextDueDate: item.nextDueDate || null,
          notes: item.notes.trim() ? item.notes.trim() : null,
        })),
      });

      hydrateFromPlan(plan);
      setFeedback({ type: 'success', message: 'Plano de avaliações salvo com sucesso.' });
    } catch (error) {
      console.error('Erro ao salvar plano de avaliações:', error);
      setFeedback({
        type: 'error',
        message: 'Não foi possível salvar o plano de avaliações.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    setFeedback(null);

    try {
      const plan = await alunoService.recalculateAssessmentPlan(alunoId);
      hydrateFromPlan(plan);
      setFeedback({
        type: 'success',
        message: 'Próximas datas recalculadas com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao recalcular plano de avaliações:', error);
      setFeedback({
        type: 'error',
        message: 'Não foi possível recalcular as próximas datas.',
      });
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plano de Avaliações</CardTitle>
          <CardDescription>Carregando dados do planejamento...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Plano de Avaliações</CardTitle>
            <CardDescription>
              O plano define quais avaliações este aluno deve realizar. O registro da avaliação continua sendo feito na aba Avaliações Físicas.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleRecalculate}
              disabled={recalculating || saving || items.length === 0}
              className="w-full sm:w-auto"
            >
              {recalculating ? 'Recalculando...' : 'Recalcular próximas datas'}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || recalculating || items.length === 0}
              className="w-full sm:w-auto"
            >
              {saving ? 'Salvando...' : 'Salvar plano'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {feedback && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-700'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-muted-foreground">
            Não há tipos de avaliação ativos para este contrato.
            {activeTypeCount > 0 && ' Atualize esta página para sincronizar o catálogo.'}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const status = inferStatus(item);
              return (
                <div key={item.assessmentTypeId} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.assessmentTypeName}</div>
                      <div className="text-xs text-muted-foreground">Código: {item.assessmentTypeCode}</div>
                    </div>
                    <span
                      className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${statusClassMap[status]}`}
                    >
                      {statusLabelMap[status]}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.isActive}
                        onChange={(event) =>
                          updateItem(item.assessmentTypeId, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                      <span>Aplicar a este aluno</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.isRequired}
                        disabled={!item.isActive}
                        onChange={(event) =>
                          updateItem(item.assessmentTypeId, {
                            isRequired: event.target.checked,
                          })
                        }
                      />
                      <span>Obrigatória</span>
                    </label>

                    <Input
                      type="number"
                      min={1}
                      max={36}
                      disabled={!item.isActive}
                      label="Periodicidade em meses"
                      value={item.cadenceMonths}
                      onChange={(event) =>
                        updateItem(item.assessmentTypeId, {
                          cadenceMonths: event.target.value,
                        })
                      }
                    />

                    <Input
                      type="date"
                      disabled={!item.isActive}
                      label="Data de início"
                      value={item.startDate}
                      onChange={(event) =>
                        updateItem(item.assessmentTypeId, {
                          startDate: event.target.value,
                        })
                      }
                    />

                    <Input
                      type="date"
                      disabled={!item.isActive}
                      label="Próxima prevista"
                      value={item.nextDueDate}
                      onChange={(event) =>
                        updateItem(item.assessmentTypeId, {
                          nextDueDate: event.target.value,
                        })
                      }
                    />

                    <div className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Última avaliação registrada
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {item.lastAssessmentDate ? formatDateBR(item.lastAssessmentDate) : 'Ainda não registrada'}
                      </div>
                    </div>
                  </div>

                  <label className="mt-3 block text-sm font-medium text-foreground">
                    Observações
                    <textarea
                      rows={3}
                      disabled={!item.isActive}
                      className="mt-2 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                      placeholder="Ex.: prioridade para avaliação inicial completa e revisão a cada 2 meses."
                      value={item.notes}
                      onChange={(event) =>
                        updateItem(item.assessmentTypeId, {
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
