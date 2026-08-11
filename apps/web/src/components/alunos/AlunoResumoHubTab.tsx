import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { Layers3 } from 'lucide-react';
import { canAccessBlock } from '../../access/access-control';
import { useAuthStore } from '../../stores/useAuthStore';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { AlunoDiscomfortSummaryCard } from './AlunoDiscomfortSummaryCard';
import { AlunoResumoHubTab as AlunoResumoHubTabBase } from './AlunoResumoHubTabBase';

type AlunoResumoHubTabProps = ComponentProps<typeof AlunoResumoHubTabBase>;

export function AlunoResumoHubTab(props: AlunoResumoHubTabProps) {
  const user = useAuthStore((state) => state.user);
  const canViewConsolidatedPrescription = canAccessBlock(
    user,
    'plans.consolidatedPrescriptions.view'
  );

  return (
    <div className="space-y-4">
      <AlunoDiscomfortSummaryCard alunoId={props.aluno.id} />
      {canViewConsolidatedPrescription && (
        <Card>
          <CardContent className="py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Layers3 size={20} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Montagem Consolidada da Prescrição</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Combine as prescrições por capacidade, revise conflitos e avance para revisão ou aprovação sem perder o contexto deste aluno.
                  </p>
                </div>
              </div>
              <Link
                to={`/central-do-aluno/${props.aluno.id}/montagem-consolidada`}
                state={{ from: 'student-central' }}
              >
                <Button variant="outline" className="w-full lg:w-auto">
                  Abrir montagem
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      <AlunoResumoHubTabBase {...props} />
    </div>
  );
}
