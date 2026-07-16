import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AlunoResumoHubTab } from './AlunoResumoHubTab';
import type { Aluno } from '../../services/aluno.service';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';

const baseAluno = {
  id: 'aluno-1',
  age: 35,
  updatedAt: '2026-01-10T12:00:00.000Z',
  user: {
    email: 'aluno@test.com',
    profile: {
      name: 'Aluno Teste',
      phone: '(15) 99999-0000',
    },
  },
  service: null,
  intakeForm: {
    assessmentDate: null,
    mainGoal: null,
    parqResponses: {},
  },
} as unknown as Aluno;

function renderResumo(
  aluno: Aluno,
  options: {
    assessments?: Assessment[];
    assessmentSummary?: AssessmentSummary[];
  } = {}
) {
  return render(
    <MemoryRouter>
      <AlunoResumoHubTab
        aluno={aluno}
        assessments={options.assessments ?? []}
        assessmentSummary={options.assessmentSummary ?? []}
        plans={[]}
        activeStudentContract={null}
        segmentedSummary={null}
      />
    </MemoryRouter>
  );
}

describe('AlunoResumoHubTab PRNT card', () => {
  it('mostra PRNT pendente quando nao ha anamnese nem objetivo', () => {
    renderResumo(baseAluno);

    expect(screen.getAllByText('PRNT pendente').length).toBeGreaterThan(0);
    expect(screen.getByText(/Completar anamnese e objetivo principal/i)).toBeInTheDocument();
    expect(screen.getAllByText('Iniciar PRNT').length).toBeGreaterThan(0);
  });

  it('destaca alerta tecnico quando PAR-Q possui respostas positivas', () => {
    renderResumo({
      ...baseAluno,
      intakeForm: {
        assessmentDate: '2026-02-01T12:00:00.000Z',
        mainGoal: 'Correr 10 km sem dor',
        parqResponses: {
          chestPain: true,
          dizziness: false,
        },
      },
    } as unknown as Aluno);

    expect(screen.getAllByText('PRNT parcial').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 alerta\(s\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Atualizar PRNT')).toBeInTheDocument();
  });
});

describe('AlunoResumoHubTab assessment card', () => {
  it('mostra estado pendente e acao de nova antropometria quando nao ha avaliacao', () => {
    renderResumo(baseAluno);

    expect(screen.getAllByText('Avaliação pendente').length).toBeGreaterThan(0);
    expect(screen.getByText(/Nenhuma avaliação física carregada/i)).toBeInTheDocument();
    expect(screen.getAllByText('Nova antropometria').length).toBeGreaterThan(0);
  });

  it('mostra ultima avaliacao, responsavel e comparacao quando ha multiplos registros', () => {
    const assessments = [
      {
        id: 'assessment-2',
        alunoId: 'aluno-1',
        typeId: 'type-1',
        assessmentDate: '2026-03-10T12:00:00.000Z',
        filePath: 'assessment-2.pdf',
        originalFileName: 'assessment-2.pdf',
        mimeType: 'application/pdf',
        fileSize: 1234,
        createdAt: '2026-03-10T12:00:00.000Z',
        updatedAt: '2026-03-10T12:00:00.000Z',
        type: {
          id: 'type-1',
          name: 'Antropometria',
          code: 'anthropometry',
        },
        professional: {
          user: {
            profile: {
              name: 'Profa. Maria',
            },
          },
        },
      },
      {
        id: 'assessment-1',
        alunoId: 'aluno-1',
        typeId: 'type-1',
        assessmentDate: '2026-01-10T12:00:00.000Z',
        filePath: 'assessment-1.pdf',
        originalFileName: 'assessment-1.pdf',
        mimeType: 'application/pdf',
        fileSize: 1234,
        createdAt: '2026-01-10T12:00:00.000Z',
        updatedAt: '2026-01-10T12:00:00.000Z',
        type: {
          id: 'type-1',
          name: 'Antropometria',
          code: 'anthropometry',
        },
      },
    ] as Assessment[];

    renderResumo(baseAluno, {
      assessments,
      assessmentSummary: [
        {
          typeId: 'type-1',
          typeName: 'Antropometria',
          scheduleType: 'fixed_interval',
          intervalMonths: 2,
          lastAssessmentDate: '2026-03-10T12:00:00.000Z',
          nextDueDate: '2026-09-10T12:00:00.000Z',
        },
      ],
    });

    expect(screen.getAllByText('Avaliação em dia').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Antropometria/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Profa\. Maria/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Base pronta para comparar')).toBeInTheDocument();
  });
});
