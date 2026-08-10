import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listProcesses: vi.fn(),
  getSession: vi.fn(),
  getParq: vi.fn(),
}));

vi.mock('../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    listProcesses: mocks.listProcesses,
    getSession: mocks.getSession,
    getParq: mocks.getParq,
  },
}));

import { useLeadOnboardingSummary } from './useLeadOnboardingSummary';

const baseSession = {
  alunoId: 'aluno-1',
  status: 'PRE_REGISTRATION_IN_PROGRESS',
  version: 1,
  currentStep: 'IDENTIFICATION',
  tenant: { name: 'Academia', privacyNoticeUrl: 'https://example.com/privacy' },
  identity: {},
  isMinor: false,
  claimRole: 'STUDENT',
  guardianAuthorization: { status: 'NOT_REQUIRED' },
  privacy: { noticeVersion: 'v1', noticeUrl: 'https://example.com/privacy' },
  missingRequiredFields: [],
  duplicateWarnings: [],
  nextSteps: [
    {
      key: 'ANAMNESIS',
      title: 'Responder Anamnese Inicial',
      description: 'desc',
      optional: true,
      status: 'NOT_STARTED',
      action: 'START',
      href: '/pre-cadastro/anamnese?alunoId=aluno-1',
    },
    {
      key: 'PARQ',
      title: 'Responder PAR-Q',
      description: 'desc',
      optional: true,
      status: 'NOT_STARTED',
      action: 'START',
      href: '/pre-cadastro/par-q?alunoId=aluno-1',
    },
  ],
};

describe('useLeadOnboardingSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna not-a-lead quando desabilitado, sem chamar a API', async () => {
    const { result } = renderHook(() => useLeadOnboardingSummary(false));

    expect(result.current.state).toEqual({ status: 'not-a-lead' });
    expect(mocks.listProcesses).not.toHaveBeenCalled();
  });

  it('retorna not-a-lead quando não há processos vinculados', async () => {
    mocks.listProcesses.mockResolvedValue([]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('not-a-lead'));
  });

  it('retorna active-student quando o único processo já é ACTIVE_STUDENT', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'ACTIVE_STUDENT' },
    ]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('active-student'));
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('retorna discarded quando o único processo foi descartado', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'DISCARDED' },
    ]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('discarded'));
  });

  it('preserva o processo preferido quando ele vira ACTIVE_STUDENT mesmo com outro processo aberto', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'ACTIVE_STUDENT' },
      { alunoId: 'aluno-2', status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true, 'aluno-1'));

    await waitFor(() => expect(result.current.state.status).toBe('active-student'));
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('preserva o processo preferido quando ele vira DISCARDED mesmo com outro processo aberto', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'DISCARDED' },
      { alunoId: 'aluno-2', status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true, 'aluno-1'));

    await waitFor(() => expect(result.current.state.status).toBe('discarded'));
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('não troca silenciosamente para outro processo quando o preferido não está mais vinculado', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-2', status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true, 'aluno-1'));

    await waitFor(() => expect(result.current.state.status).toBe('not-a-lead'));
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('carrega a sessão e retorna open com nextSteps para processo em andamento', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);
    mocks.getSession.mockResolvedValue(baseSession);
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('open'));
    if (result.current.state.status === 'open') {
      expect(result.current.state.session.alunoId).toBe('aluno-1');
      expect(result.current.state.parq).toBeNull();
    }
    expect(mocks.getParq).not.toHaveBeenCalled();
  });

  it('busca o PAR-Q canônico quando o cadastro básico está concluído', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockResolvedValue({ ...baseSession, status: 'PRE_REGISTRATION_COMPLETED' });
    mocks.getParq.mockResolvedValue({ alunoId: 'aluno-1', status: 'COMPLETED_REVIEW_REQUIRED' });
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('open'));
    if (result.current.state.status === 'open') {
      expect(result.current.state.parq?.status).toBe('COMPLETED_REVIEW_REQUIRED');
    }
  });

  it('detecta conversão para ACTIVE_STUDENT durante a sessão', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockResolvedValue({ ...baseSession, status: 'ACTIVE_STUDENT' });
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('active-student'));
  });

  it('detecta DISCARDED retornado pela sessão mesmo se a lista ainda mostrava processo aberto', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockResolvedValue({ ...baseSession, status: 'DISCARDED' });
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('discarded'));
  });

  it('retorna error com mensagem quando a API falha, sem cair em not-a-lead', async () => {
    mocks.listProcesses.mockRejectedValue({
      response: { data: { error: 'Falha ao carregar processos' } },
    });
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toBe('Falha ao carregar processos');
    }
  });

  it('retry recarrega os dados após um erro', async () => {
    mocks.listProcesses.mockRejectedValueOnce(new Error('boom'));
    mocks.listProcesses.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useLeadOnboardingSummary(true));

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    result.current.retry();
    await waitFor(() => expect(result.current.state.status).toBe('not-a-lead'));
    expect(mocks.listProcesses).toHaveBeenCalledTimes(2);
  });
});
