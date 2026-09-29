import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle,
  Dumbbell,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import type { ResistedStimulus } from '../../services/periodization.service';

interface WeeklySummaryCardsProps {
  summary: ResistedStimulus | null;
  assemblyLabel?: string;
  methodLabel?: string;
  loadCycleLabel?: string;
  objectiveLabel?: string;
}

type SummaryCard = {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
};

const display = (value: string | number | null | undefined, suffix = '') =>
  value === null || value === undefined || value === '' ? '-' : `${value}${suffix}`;

export default function WeeklySummaryCards({
  summary,
  assemblyLabel,
  methodLabel,
  loadCycleLabel,
  objectiveLabel,
}: WeeklySummaryCardsProps) {
  const cards: SummaryCard[] = [
    { title: '% Carga TR', value: display(summary?.loadPercentage, '%'), icon: TrendingUp, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: 'Séries Grandes Músculos', value: display(summary?.seriesReference), icon: Dumbbell, color: 'text-success', bgColor: 'bg-success/10' },
    { title: 'Zona de Repetições', value: display(summary?.repZone), icon: Activity, color: 'text-info', bgColor: 'bg-info/10' },
    { title: 'Repetições em Reserva', value: display(summary?.repReserve), icon: CheckCircle, color: 'text-warning', bgColor: 'bg-warning/10' },
    { title: 'Montagem', value: display(assemblyLabel ?? summary?.assembly), icon: BookOpen, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: 'Método', value: display(methodLabel ?? summary?.method), icon: Activity, color: 'text-success', bgColor: 'bg-success/10' },
    { title: 'Microciclo', value: display(loadCycleLabel ?? summary?.loadCycle), icon: Calendar, color: 'text-info', bgColor: 'bg-info/10' },
    { title: 'Divisão do Treino', value: display(summary?.trainingDivision), icon: Dumbbell, color: 'text-warning', bgColor: 'bg-warning/10' },
    { title: 'Frequência Semanal', value: display(summary?.weeklyFrequency, 'x/sem'), icon: Calendar, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: 'Objetivo do Mesociclo', value: display(objectiveLabel ?? summary?.objective), icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10' },
  ];

  return (
    <section aria-label="Indicadores do resumo da semana">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="min-w-0 transition-shadow hover:shadow-card-hover">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="pr-2 text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <div className={`shrink-0 rounded-lg p-2 ${card.bgColor}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="break-words text-lg font-semibold leading-snug text-foreground">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
