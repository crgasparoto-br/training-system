import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button, buttonClassName } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { getStudentContractId, withStudentContractContext } from '../services/student-self.service';
import {
  studentWorkoutService,
  type StudentWorkoutDetail,
  type StudentWorkoutDetailDay,
  type StudentWorkoutSummary,
} from '../services/student-workout.service';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function endOfWorkoutWeek(value: string) {
  const end = new Date(value);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export function splitStudentWorkouts(
  workouts: StudentWorkoutSummary[],
  now: Date = new Date()
) {
  const boundary = new Date(now);
  boundary.setUTCHours(0, 0, 0, 0);

  const currentAndUpcoming = workouts.filter(
    (workout) => endOfWorkoutWeek(workout.weekStartDate).getTime() >= boundary.getTime()
  );
  const history = workouts
    .filter((workout) => endOfWorkoutWeek(workout.weekStartDate).getTime() < boundary.getTime())
    .slice()
    .reverse();

  return { currentAndUpcoming, history };
}

function sessionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    planned: 'Planejado',
    in_progress: 'Em andamento',
    completed: 'Concluído',
    skipped: 'Não realizado',
  };
  return labels[status] ?? status;
}

function WorkoutSummaryCard({
  workout,
  search,
  featured = false,
}: {
  workout: StudentWorkoutSummary;
  search: string;
  featured?: boolean;
}) {
  const route = `/student/workouts/${workout.id}`;
  const href = search ? `${route}${search}` : route;

  return (
    <Card className={featured ? 'border-primary/40' : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {featured ? 'Atual ou próximo' : `Semana ${workout.weekNumber}`}
          </p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {workout.workoutDays.length} {workout.workoutDays.length === 1 ? 'sessão' : 'sessões'}
          </span>
        </div>
        <CardTitle className="text-lg">{workout.plan.name}</CardTitle>
        <CardDescription>
          Semana {workout.weekNumber} · início em {formatDate(workout.weekStartDate)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {workout.workoutDays.length > 0 && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {workout.workoutDays.slice(0, 3).map((day) => (
              <p key={day.id}>
                {formatDate(day.workoutDate)}
                {day.method ? ` · ${day.method}` : ''}
                {day.sessionDurationMin ? ` · ${day.sessionDurationMin} min` : ''}
              </p>
            ))}
            {workout.workoutDays.length > 3 && (
              <p>+ {workout.workoutDays.length - 3} sessão(ões)</p>
            )}
          </div>
        )}
        <Link to={href} className={buttonClassName({ className: 'w-full sm:w-auto' })}>
          Ver detalhes
        </Link>
      </CardContent>
    </Card>
  );
}

function WorkoutDayCard({ day }: { day: StudentWorkoutDetailDay }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{formatDate(day.workoutDate)}</CardTitle>
            <CardDescription>
              {[day.method, day.location].filter(Boolean).join(' · ') || 'Sessão programada'}
            </CardDescription>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {sessionStatusLabel(day.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {day.sessionDurationMin != null && (
            <div>
              <dt className="text-muted-foreground">Duração</dt>
              <dd className="font-medium">{day.sessionDurationMin} min</dd>
            </div>
          )}
          {day.targetHrMin && day.targetHrMax && (
            <div>
              <dt className="text-muted-foreground">Frequência cardíaca</dt>
              <dd className="font-medium">{day.targetHrMin}–{day.targetHrMax}</dd>
            </div>
          )}
          {day.targetSpeedMin && day.targetSpeedMax && (
            <div>
              <dt className="text-muted-foreground">Velocidade</dt>
              <dd className="font-medium">{day.targetSpeedMin}–{day.targetSpeedMax}</dd>
            </div>
          )}
          {day.restTime != null && (
            <div>
              <dt className="text-muted-foreground">Intervalo da sessão</dt>
              <dd className="font-medium">{day.restTime} s</dd>
            </div>
          )}
        </dl>

        {(day.generalGuidelines || day.detailNotes || day.complementNotes) && (
          <section className="rounded-lg bg-muted/50 p-4" aria-label="Orientações da sessão">
            <h3 className="font-semibold">Orientações</h3>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              {day.generalGuidelines && <p>{day.generalGuidelines}</p>}
              {day.detailNotes && <p>{day.detailNotes}</p>}
              {day.complementNotes && <p>{day.complementNotes}</p>}
            </div>
          </section>
        )}

        <section aria-labelledby={`exercises-${day.id}`}>
          <h3 id={`exercises-${day.id}`} className="font-semibold">
            Exercícios
          </h3>
          {day.exercises.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Esta sessão não possui exercícios detalhados.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {day.exercises.map((item) => (
                <li key={item.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{item.exercise.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[item.section, item.system].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {item.sets != null && <span>{item.sets} séries</span>}
                      {item.reps != null && <span>{item.reps} repetições</span>}
                      {item.load != null && <span>{item.load} kg</span>}
                      {item.intervalSec != null && <span>{item.intervalSec} s intervalo</span>}
                    </div>
                  </div>
                  {item.exerciseNotes && (
                    <p className="mt-2 text-sm text-muted-foreground">{item.exerciseNotes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export function StudentWorkouts() {
  const { workoutTemplateId } = useParams<{ workoutTemplateId?: string }>();
  const location = useLocation();
  const contractId = getStudentContractId(location.search);
  const [workouts, setWorkouts] = useState<StudentWorkoutSummary[]>([]);
  const [detail, setDetail] = useState<StudentWorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (workoutTemplateId) {
        setDetail(await studentWorkoutService.getDetail(workoutTemplateId, contractId));
      } else {
        setWorkouts(await studentWorkoutService.list(contractId));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [contractId, workoutTemplateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => splitStudentWorkouts(workouts), [workouts]);
  const listRoute = withStudentContractContext('/student/workouts', contractId);

  if (loading) {
    return (
      <div className="space-y-6" aria-live="polite">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Aluno</p>
          <h1 className="text-2xl font-bold text-foreground">Meus Treinos</h1>
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Carregando seus treinos...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Aluno</p>
          <h1 className="text-2xl font-bold text-foreground">Meus Treinos</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Não foi possível carregar seus treinos</CardTitle>
            <CardDescription>
              Tente novamente. Se o problema continuar, volte mais tarde ou fale com seu professor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void load()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workoutTemplateId && detail) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Link to={listRoute} className={buttonClassName({ variant: 'outline', size: 'sm' })}>
            Voltar aos treinos
          </Link>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Aluno · somente leitura</p>
            <h1 className="text-2xl font-bold text-foreground">{detail.plan.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Semana {detail.weekNumber} · início em {formatDate(detail.weekStartDate)}
            </p>
          </div>
        </div>

        {(detail.studentGoal || detail.trainingMethod || detail.trainingDivision || detail.observation1) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo do treino</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              {detail.studentGoal && (
                <div>
                  <p className="text-muted-foreground">Objetivo</p>
                  <p className="font-medium">{detail.studentGoal}</p>
                </div>
              )}
              {detail.trainingMethod && (
                <div>
                  <p className="text-muted-foreground">Método</p>
                  <p className="font-medium">{detail.trainingMethod}</p>
                </div>
              )}
              {detail.trainingDivision && (
                <div>
                  <p className="text-muted-foreground">Divisão</p>
                  <p className="font-medium">{detail.trainingDivision}</p>
                </div>
              )}
              {detail.observation1 && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Observação</p>
                  <p className="font-medium">{detail.observation1}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <section className="space-y-3" aria-labelledby="sessions-title">
          <div>
            <h2 id="sessions-title" className="text-lg font-semibold">Sessões</h2>
            <p className="text-sm text-muted-foreground">
              Consulte as orientações e exercícios definidos pelo seu professor.
            </p>
          </div>
          {detail.workoutDays.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Este treino foi liberado, mas ainda não possui sessões detalhadas.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {detail.workoutDays.map((day) => <WorkoutDayCard key={day.id} day={day} />)}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Aluno</p>
        <h1 className="text-2xl font-bold text-foreground">Meus Treinos</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Aqui aparecem somente os treinos que seu professor já liberou para você.
        </p>
      </div>

      {workouts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nenhum treino liberado</CardTitle>
            <CardDescription>
              Quando seu professor liberar um treino, ele aparecerá aqui automaticamente.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {grouped.currentAndUpcoming.length > 0 && (
            <section className="space-y-3" aria-labelledby="current-workouts-title">
              <div>
                <h2 id="current-workouts-title" className="text-lg font-semibold">
                  Atual e próximos
                </h2>
                <p className="text-sm text-muted-foreground">
                  Comece pelo primeiro treino abaixo e consulte os detalhes de cada semana.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {grouped.currentAndUpcoming.map((workout, index) => (
                  <WorkoutSummaryCard
                    key={workout.id}
                    workout={workout}
                    search={location.search}
                    featured={index === 0}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.history.length > 0 && (
            <section className="space-y-3" aria-labelledby="workout-history-title">
              <div>
                <h2 id="workout-history-title" className="text-lg font-semibold">Histórico</h2>
                <p className="text-sm text-muted-foreground">
                  Treinos liberados de semanas anteriores continuam disponíveis para consulta.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {grouped.history.map((workout) => (
                  <WorkoutSummaryCard
                    key={workout.id}
                    workout={workout}
                    search={location.search}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
