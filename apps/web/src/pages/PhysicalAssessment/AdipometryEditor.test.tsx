import { render, screen } from '@testing-library/react';
import type { AdipometryAssessmentDetail } from '@corrida/types';
import { describe, expect, it, vi } from 'vitest';
import { AdipometryEditor } from './AdipometryEditor';
import { createEmptyAdipometryForm } from './adipometry-ui';

const current = {
  id: 'assessment-1',
  contractId: 'contract-1',
  alunoId: 'aluno-1',
  professorId: 'professor-1',
  code: 'ADPT-001',
  sequenceNumber: 1,
  assessmentDate: '2026-08-04',
  status: 'DRAFT',
  revisionStatus: 'DRAFT',
  rootAssessmentId: 'assessment-1',
  revisionNumber: 1,
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
  measurements: {},
} satisfies AdipometryAssessmentDetail;

describe('AdipometryEditor accessibility', () => {
  it('associa semanticamente a mensagem de erro ao campo inválido', () => {
    render(
      <AdipometryEditor
        selectedAlunoId="aluno-1"
        current={current}
        assessments={[]}
        protocols={[]}
        form={createEmptyAdipometryForm()}
        preview={null}
        support={null}
        fieldErrors={{ tricepsMm: 'Informe uma dobra tricipital válida.' }}
        busy={false}
        dirty
        canMutate
        canCorrect={false}
        capacityWarningConfirmed={false}
        onForm={vi.fn()}
        onMeasurement={vi.fn()}
        onHelp={vi.fn()}
        onSave={vi.fn()}
        onCalculate={vi.fn()}
        onFinalize={vi.fn()}
        onCorrection={vi.fn()}
        onCancelCorrection={vi.fn()}
        onOpen={vi.fn()}
        onCapacityWarning={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Dobra tricipital (mm)');
    const error = screen.getByText('Informe uma dobra tricipital válida.');

    expect(error).toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(error.id).toBe('adpt-tricepsMm-error');
  });
});
