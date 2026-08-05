import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryProtocolSummary,
} from '@corrida/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdipometryAnthropometrySupport } from '../../services/adipometry.service';

const mocks = vi.hoisted(() => ({
  listAlunos: vi.fn(),
  listAssessments: vi.fn(),
  getAssessment: vi.fn(),
  listProtocols: vi.fn(),
  getAnthropometrySupport: vi.fn(),
}));

vi.mock('../../services/aluno.service', () => ({
  alunoService: { list: mocks.listAlunos },
}));

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: {
    listAssessments: mocks.listAssessments,
    getAssessment: mocks.getAssessment,
    listProtocols: mocks.listProtocols,
    getAnthropometrySupport: mocks.getAnthropometrySupport,
  },
}));

import { useAdipometryWorkspace } from './useAdipometryWorkspace';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function assessment(id: string, alunoId: string, assessmentDate = '2026-08-04') {
  return {
    id,
    alunoId,
    professorId: 'professor-1',
    code: `ADPT-${id}`,
    assessmentDate,
    status: 'DRAFT',
    revisionStatus: 'DRAFT',
    revisionNumber: 1,
    protocolCode: 'PROTO',
    protocolVersion: 1,
    protocolSex: 'male',
    protocolSexSource: 'profile',
    protocolSexOverrideReason: null,
    anthropometryReference: null,
    notes: `dados-${alunoId}`,
    measurements: {
      weightKg: 80,
      tricepsMm: 10,
      subscapularMm: 11,
      suprailiacMm: 12,
      abdominalMm: 13,
      thighMm: 14,
    },
    updatedAt: '2026-08-04T12:00:00.000Z',
  } as AdipometryAssessmentDetail;
}

function summary(id: string, alunoId: string) {
  return {
    id,
    alunoId,
    status: 'DRAFT',
    revisionStatus: 'DRAFT',
    assessmentDate: '2026-08-04',
  } as AdipometryAssessmentSummary;
}

function protocol(code: string) {
  return {
    code,
    name: code,
    version: 1,
    status: 'APPROVED',
    compatibility: { compatible: true, reasons: [], warnings: [] },
  } as AdipometryProtocolSummary;
}

function support(code: string) {
  return {
    latestEligible: {
      anthropometryAssessmentId: code,
      assessmentCode: code,
      assessmentDate: '2026-08-01',
      notes: null,
      measurements: [],
      observations: [],
    },
    selected: null,
  } as AdipometryAnthropometrySupport;
}

describe('useAdipometryWorkspace context isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAlunos.mockResolvedValue({ alunos: [] });
    mocks.listProtocols.mockResolvedValue([protocol('INITIAL')]);
    mocks.getAnthropometrySupport.mockResolvedValue(support('ANTR-INITIAL'));
  });

  it('ignora resposta antiga de aluno depois que um novo contexto foi selecionado', async () => {
    const historyA = deferred<AdipometryAssessmentSummary[]>();
    const historyB = deferred<AdipometryAssessmentSummary[]>();
    mocks.listAssessments.mockImplementation((alunoId: string) =>
      alunoId === 'aluno-a' ? historyA.promise : historyB.promise
    );

    const { result } = renderHook(() => useAdipometryWorkspace({
      canView: true,
      lockedAlunoId: '',
      assessmentIdParam: '',
    }));

    act(() => result.current.selectAluno('aluno-a'));
    await waitFor(() => expect(mocks.listAssessments).toHaveBeenCalledWith('aluno-a'));

    act(() => result.current.selectAluno('aluno-b'));

    expect(result.current.selectedAlunoId).toBe('aluno-b');
    expect(result.current.current).toBeNull();
    expect(result.current.assessments).toEqual([]);
    expect(result.current.protocols).toEqual([]);
    expect(result.current.support).toBeNull();

    await act(async () => {
      historyA.resolve([summary('a-1', 'aluno-a')]);
      await Promise.resolve();
    });

    expect(mocks.getAssessment).not.toHaveBeenCalledWith('a-1');
    expect(result.current.current).toBeNull();

    await act(async () => {
      historyB.resolve([]);
      await historyB.promise;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current).toBeNull();
  });

  it('não restaura avaliação anterior quando o novo aluno falha ao carregar', async () => {
    mocks.listAssessments.mockImplementation((alunoId: string) => {
      if (alunoId === 'aluno-a') return Promise.resolve([summary('a-1', alunoId)]);
      return Promise.reject(new Error('Falha ao carregar aluno B'));
    });
    mocks.getAssessment.mockResolvedValue(assessment('a-1', 'aluno-a'));

    const { result } = renderHook(() => useAdipometryWorkspace({
      canView: true,
      lockedAlunoId: '',
      assessmentIdParam: '',
    }));

    act(() => result.current.selectAluno('aluno-a'));
    await waitFor(() => expect(result.current.current?.alunoId).toBe('aluno-a'));
    expect(result.current.form.notes).toBe('dados-aluno-a');

    act(() => result.current.selectAluno('aluno-b'));

    expect(result.current.current).toBeNull();
    expect(result.current.form.notes).toBe('');

    await waitFor(() => expect(result.current.error).toBe('Falha ao carregar aluno B'));
    expect(result.current.current).toBeNull();
    expect(result.current.assessments).toEqual([]);
    expect(result.current.form.notes).toBe('');
  });

  it('mantém somente protocolos e apoio da data mais recente', async () => {
    const protocolsD1 = deferred<AdipometryProtocolSummary[]>();
    const protocolsD2 = deferred<AdipometryProtocolSummary[]>();
    const supportD1 = deferred<AdipometryAnthropometrySupport>();
    const supportD2 = deferred<AdipometryAnthropometrySupport>();

    mocks.listAssessments.mockResolvedValue([summary('a-1', 'aluno-a')]);
    mocks.getAssessment.mockResolvedValue(assessment('a-1', 'aluno-a'));
    mocks.listProtocols.mockImplementation((_alunoId: string, date: string) => {
      if (date === '2026-08-01') return protocolsD1.promise;
      if (date === '2026-08-02') return protocolsD2.promise;
      return Promise.resolve([protocol('INITIAL')]);
    });
    mocks.getAnthropometrySupport.mockImplementation((_alunoId: string, date: string) => {
      if (date === '2026-08-01') return supportD1.promise;
      if (date === '2026-08-02') return supportD2.promise;
      return Promise.resolve(support('ANTR-INITIAL'));
    });

    const { result } = renderHook(() => useAdipometryWorkspace({
      canView: true,
      lockedAlunoId: 'aluno-a',
      assessmentIdParam: '',
    }));

    await waitFor(() => expect(result.current.current?.id).toBe('a-1'));

    act(() => result.current.setFormField('assessmentDate', '2026-08-01'));
    act(() => result.current.setFormField('assessmentDate', '2026-08-02'));

    expect(result.current.protocols).toEqual([]);
    expect(result.current.support).toBeNull();
    expect(result.current.referencesLoading).toBe(true);

    await act(async () => {
      protocolsD2.resolve([protocol('DATE-2')]);
      supportD2.resolve(support('ANTR-DATE-2'));
      await Promise.all([protocolsD2.promise, supportD2.promise]);
    });

    await waitFor(() => expect(result.current.protocols[0]?.code).toBe('DATE-2'));
    expect(result.current.support?.latestEligible?.assessmentCode).toBe('ANTR-DATE-2');
    expect(result.current.referencesLoading).toBe(false);

    await act(async () => {
      protocolsD1.resolve([protocol('DATE-1')]);
      supportD1.resolve(support('ANTR-DATE-1'));
      await Promise.all([protocolsD1.promise, supportD1.promise]);
    });

    expect(result.current.protocols[0]?.code).toBe('DATE-2');
    expect(result.current.support?.latestEligible?.assessmentCode).toBe('ANTR-DATE-2');
  });
});
