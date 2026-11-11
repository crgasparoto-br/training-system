// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingRoutineSessionDetail, TrainingSubstitutionRecord } from '@corrida/types';
import { TrainingSubstitutionCard } from './TrainingSubstitutionCard';
import { trainingRoutineService } from '../../services/training-routine.service';

vi.mock('../../services/training-routine.service', () => ({
  trainingRoutineService: {
    getSubstitutionAlternatives: vi.fn(), createSubstitution: vi.fn(), reviewSubstitution: vi.fn(),
  },
}));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

const session = (status: 'not_started' | 'in_progress' | 'completed', substitutions: TrainingSubstitutionRecord[] = []) => ({
  sessionId: 'day-404', status, execution: { status, version: status === 'not_started' ? 0 : 3 },
  blocks: [{ key: 'main', exercises: [{ id: 'planned-404', name: 'Agachamento original' }] }],
  substitutions,
} as unknown as TrainingRoutineSessionDetail);
const sampleAlternative = {
  kind: 'exercise' as const,
  replacement: {
    unitId: 'candidate-404', id: 'candidate-404', name: 'Agachamento alternativo',
    version: 'exercicio:7', capacity: 'resisted', movementPattern: 'squat',
    equipment: ['halteres'], difficulty: 'intermediate', restrictions: [],
  },
  suitability: {
    sameMovementPattern: true, sameCapacity: true, sameDifficulty: true,
    sharedEquipment: ['halteres'], requiresProfessionalReview: false,
  },
  objectiveHint: 'Manter estabilidade',
};
const pending: TrainingSubstitutionRecord = {
  id: 'swap-404', sessionId: 'day-404', alunoId: 'student-404',
  kind: 'exercise', context: 'execution', status: 'pending_review',
  original: { ...sampleAlternative.replacement, unitId: 'planned-404', id: 'original-catalog-404',
    name: 'Agachamento original', version: 'exercicio:3' },
  replacement: sampleAlternative.replacement,
  originalVersion: 'exercicio:3', replacementVersion: 'exercicio:7',
  reason: 'Equipamento indisponível', actorUserId: 'student-user-404',
  createdAt: '2026-11-11T14:00:00Z', reviewedByUserId: null, reviewedAt: null,
  reviewReason: null, version: 1,
};

describe('TrainingSubstitutionCard #404', () => {
  it('suggestion is not autoapproval; teacher must choose and justify the replacement', async () => {
    vi.mocked(trainingRoutineService.getSubstitutionAlternatives).mockResolvedValue({ items: [sampleAlternative], nextOffset: null });
    vi.mocked(trainingRoutineService.createSubstitution).mockResolvedValue({ ...pending, status: 'approved' });
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<TrainingSubstitutionCard session={session('not_started')} audience="professor" canManage onChanged={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar alternativas elegíveis' }));
    await waitFor(() => expect(screen.getByText(/Agachamento alternativo/)).toBeTruthy());
    expect(trainingRoutineService.createSubstitution).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Substituto'), { target: { value: 'candidate-404' } });
    const save = screen.getByRole('button', { name: 'Aprovar alternativa' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo obrigatório'), {
      target: { value: 'Ajuste supervisionado pelo professor' },
    });
    fireEvent.click(save);
    await waitFor(() => expect(trainingRoutineService.createSubstitution).toHaveBeenCalledTimes(1));
    expect(vi.mocked(trainingRoutineService.createSubstitution).mock.calls[0][1]).toMatchObject({
      kind: 'exercise', context: 'planning', originalUnitId: 'planned-404',
      replacementUnitId: 'candidate-404',
      reason: 'Ajuste supervisionado pelo professor',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('records during execution as pending review and forwards contract and version', async () => {
    vi.mocked(trainingRoutineService.getSubstitutionAlternatives).mockResolvedValue({ items: [sampleAlternative], nextOffset: null });
    vi.mocked(trainingRoutineService.createSubstitution).mockResolvedValue(pending);
    render(<TrainingSubstitutionCard session={session('in_progress')} audience="student" contractId="contract-404" />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar alternativas elegíveis' }));
    await waitFor(() => expect(screen.getByText(/Agachamento alternativo/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Substituto'), { target: { value: 'candidate-404' } });
    fireEvent.change(screen.getByLabelText('Motivo obrigatório'), {
      target: { value: 'Outro equipamento disponível' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar troca para revisão' }));
    await waitFor(() => expect(trainingRoutineService.createSubstitution).toHaveBeenCalledTimes(1));
    expect(vi.mocked(trainingRoutineService.createSubstitution).mock.calls[0]).toMatchObject([
      'day-404', { context: 'execution', expectedExecutionVersion: 3 }, 'contract-404',
    ]);
    expect(screen.getByText(/professor poderá revisá-la/i)).toBeTruthy();
  });

  it('requires a professional reviewer to explicitly approve or reject an execution swap', async () => {
    vi.mocked(trainingRoutineService.reviewSubstitution).mockResolvedValue({
      ...pending, status: 'approved', version: 2,
    });
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<TrainingSubstitutionCard session={session('completed', [pending])}
      audience="professor" canManage onChanged={onChanged} />);
    expect(screen.getByText(/Aguardando revisão do professor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar troca' }));
    expect(screen.getByRole('alert').textContent).toContain('Informe o motivo');
    expect(trainingRoutineService.reviewSubstitution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar troca registrada' }));
    await waitFor(() => expect(trainingRoutineService.reviewSubstitution).toHaveBeenCalledWith(
      'day-404', 'swap-404', { action: 'approve', expectedVersion: 1 },
    ));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });


  it('searches and loads later pages without losing previously available choices', async () => {
    const second = { ...sampleAlternative, replacement: {
      ...sampleAlternative.replacement, id: 'candidate-405', unitId: 'candidate-405', name: 'Outra alternativa',
    } };
    vi.mocked(trainingRoutineService.getSubstitutionAlternatives)
      .mockResolvedValueOnce({ items: [sampleAlternative], nextOffset: 25 })
      .mockResolvedValueOnce({ items: [second], nextOffset: null });
    render(<TrainingSubstitutionCard session={session('not_started')} audience="professor" canManage />);
    fireEvent.change(screen.getByLabelText('Buscar alternativa'), { target: { value: 'squat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar alternativas elegíveis' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carregar mais alternativas' })).toBeTruthy());
    expect(trainingRoutineService.getSubstitutionAlternatives).toHaveBeenCalledWith(
      'day-404', 'exercise', 'planned-404', undefined, { search: 'squat', offset: 0 },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais alternativas' }));
    await waitFor(() => expect(screen.getByText(/Outra alternativa/)).toBeTruthy());
    expect(trainingRoutineService.getSubstitutionAlternatives).toHaveBeenLastCalledWith(
      'day-404', 'exercise', 'planned-404', undefined, { search: 'squat', offset: 25 },
    );
    expect(screen.getByText(/Agachamento alternativo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Carregar mais alternativas' })).toBeNull();
  });

  it('keeps a confirmed creation confirmed when routine refresh fails, then retries only the read', async () => {
    vi.mocked(trainingRoutineService.getSubstitutionAlternatives)
      .mockResolvedValue({ items: [sampleAlternative], nextOffset: null });
    vi.mocked(trainingRoutineService.createSubstitution).mockResolvedValue({ ...pending, status: 'approved' });
    const onChanged = vi.fn().mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    render(<TrainingSubstitutionCard session={session('not_started')} audience="professor" canManage onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar alternativas elegíveis' }));
    await waitFor(() => expect(screen.getByText(/Agachamento alternativo/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Substituto'), { target: { value: 'candidate-404' } });
    fireEvent.change(screen.getByLabelText('Motivo obrigatório'), { target: { value: 'Motivo técnico' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar alternativa' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar histórico' })).toBeTruthy());
    expect(screen.getByText(/Alternativa aprovada. O planejamento original/)).toBeTruthy();
    expect(screen.queryByText(/Não foi possível registrar/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Buscar alternativas elegíveis' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar histórico' }));
    await waitFor(() => expect(screen.getByText(/Histórico atualizado/)).toBeTruthy());
    expect(trainingRoutineService.createSubstitution).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps a confirmed review confirmed after refresh failure without double reviewing', async () => {
    vi.mocked(trainingRoutineService.reviewSubstitution)
      .mockResolvedValue({ ...pending, status: 'approved', version: 2 });
    const onChanged = vi.fn().mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    render(<TrainingSubstitutionCard session={session('completed', [pending])}
      audience="professor" canManage onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar troca registrada' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar histórico' })).toBeTruthy());
    expect(screen.getByText(/Substituição aprovada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprovar troca registrada' })).toHaveProperty('disabled', true);
    expect(screen.queryByText(/Não foi possível revisar/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar histórico' }));
    await waitFor(() => expect(screen.getByText(/Histórico atualizado/)).toBeTruthy());
    expect(trainingRoutineService.reviewSubstitution).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('shows history but never offers professional mutations when only read access is granted', () => {
    render(<TrainingSubstitutionCard session={session('completed', [pending])} audience="professor" />);
    expect(screen.getByText(/Aguardando revisão do professor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aprovar troca registrada' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rejeitar troca' })).toBeNull();
    expect(trainingRoutineService.reviewSubstitution).not.toHaveBeenCalled();
  });

  it('does not offer planning to read-only staff while preserving the original session', () => {
    render(<TrainingSubstitutionCard session={session('not_started')} audience="professor" />);
    expect(screen.getByText(/Nenhuma substituição registrada/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Buscar alternativas elegíveis' })).toBeNull();
    expect(trainingRoutineService.createSubstitution).not.toHaveBeenCalled();
  });

  it('does not offer changes to a finished student session or approval to the athlete', () => {
    render(<TrainingSubstitutionCard session={session('completed', [pending])} audience="student" />);
    expect(screen.queryByRole('button', { name: 'Buscar alternativas elegíveis' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Aprovar troca registrada/ })).toBeNull();
    expect(screen.getByText(/Agachamento original/)).toBeTruthy();
  });
});
