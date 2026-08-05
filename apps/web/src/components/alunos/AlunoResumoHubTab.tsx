import type { ComponentProps } from 'react';
import { AlunoDiscomfortSummaryCard } from './AlunoDiscomfortSummaryCard';
import { AlunoResumoHubTab as AlunoResumoHubTabBase } from './AlunoResumoHubTabBase';

type AlunoResumoHubTabProps = ComponentProps<typeof AlunoResumoHubTabBase>;

export function AlunoResumoHubTab(props: AlunoResumoHubTabProps) {
  return (
    <div className="space-y-4">
      <AlunoDiscomfortSummaryCard alunoId={props.aluno.id} />
      <AlunoResumoHubTabBase {...props} />
    </div>
  );
}
