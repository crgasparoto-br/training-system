import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Activity } from 'lucide-react';
import type { ProntuarioPainCase } from '@corrida/types';
import { canAccessBlock } from '../../access/access-control';
import { prontuarioService } from '../../services/prontuario.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatDateBR } from '../../utils/date';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';

type AlunoDiscomfortSummaryCardProps = {
  alunoId: string;
};

const isActiveCase = (item: ProntuarioPainCase) =>
  item.status === 'active' || item.status === 'monitoring';

const latestFollowUpFrom = (items: ProntuarioPainCase[]) =>
  items
    .flatMap((item) => item.followUps || [])
    .filter((item) => Boolean(item.followUpAt))
    .sort(
      (left, right) =>
        new Date(right.followUpAt).getTime() - new Date(left.followUpAt).getTime()
    )[0] ?? null;

export function AlunoDiscomfortSummaryCard({ alunoId }: AlunoDiscomfortSummaryCardProps) {
  const { user } = useAuthStore();
  const canViewHealthData = canAccessBlock(user, 'students.details.health');
  const [cases, setCases] = useState<ProntuarioPainCase[]>([]);
  const [loading, setLoading] = useState(canViewHealthData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewHealthData) {
      setCases([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    prontuarioService
      .overview(alunoId)
      .then((overview) => {
        if (!active) return;
        const record = overview.currentRecord ?? overview.records[0] ?? null;
        setCases(record?.painCases || []);
      })
      .catch(() => {
        if (!active) return;
        setError('Não foi possível carregar os desconfortos do PRNT.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [alunoId, canViewHealthData]);

  const activeCases = useMemo(() => cases.filter(isActiveCase), [cases]);
  const latestFollowUp = useMemo(() => latestFollowUpFrom(cases), [cases]);
  const latestActiveCase = useMemo(
    () =>
      [...activeCases].sort((left, right) => {
        const leftDate = left.onsetDate ? new Date(left.onsetDate).getTime() : 0;
        const rightDate = right.onsetDate ? new Date(right.onsetDate).getTime() : 0;
        return rightDate - leftDate;
      })[0] ?? null,
    [activeCases]
  );

  if (!canViewHealthData) return null;

  const prontuarioPath =
    `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=${alunoId}`;

  return (
    <Card className={activeCases.length > 0 ? 'border-amber-300' : undefined}>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Dores, desconfortos e acompanhamentos</CardTitle>
            <CardDescription>
              Situação atual do PRNT para revisar restrições e acompanhamentos sem perder o contexto do aluno.
            </CardDescription>
          </div>
          <span
            className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${
              activeCases.length > 0
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-emerald-200 bg-emerald-100 text-emerald-700'
            }`}
          >
            {loading ? 'Carregando' : `${activeCases.length} ativo(s)`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error} A Central continua disponível; tente abrir o PRNT novamente.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Casos ativos
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {loading ? '—' : activeCases.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Casos ativos ou em acompanhamento no prontuário.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Último acompanhamento
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {latestFollowUp ? formatDateBR(latestFollowUp.followUpAt) : 'Não registrado'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {latestFollowUp?.intensity != null
                ? `Intensidade informada: ${latestFollowUp.intensity}/10.`
                : 'Registre a evolução para manter a conduta rastreável.'}
            </p>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              activeCases.length > 0
                ? 'border-amber-200 bg-amber-50/60'
                : 'border-emerald-200 bg-emerald-50/50'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {activeCases.length > 0 ? <AlertTriangle size={14} /> : <Activity size={14} />}
              Situação técnica
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {activeCases.length > 0 ? 'Revisar antes da próxima conduta' : 'Sem desconforto ativo'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {latestActiveCase
                ? `${latestActiveCase.title}${latestActiveCase.region ? ` • ${latestActiveCase.region}` : ''}`
                : 'Nenhum caso ativo foi encontrado no PRNT carregado.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {activeCases.length > 0 ? 'Acompanhar ou encerrar desconforto' : 'Registrar novo desconforto'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O PRNT preserva aluno, histórico, datas e acompanhamentos vinculados ao caso.
            </p>
          </div>
          <Link to={prontuarioPath}>
            <Button size="sm" variant={activeCases.length > 0 ? 'default' : 'outline'}>
              Abrir acompanhamentos
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
