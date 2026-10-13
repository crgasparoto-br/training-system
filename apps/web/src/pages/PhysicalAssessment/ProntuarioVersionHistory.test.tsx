// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProntuarioHistoryEvent, ProntuarioHealthIntakeRevision } from '@corrida/types';
import { prontuarioService } from '../../services/prontuario.service';
import { ProntuarioVersionHistory } from './ProntuarioVersionHistory';
import { ProntuarioHealthIntakeHistory } from './ProntuarioHealthIntakeHistory';

vi.mock('../../services/prontuario.service', () => ({
  prontuarioService: { history: vi.fn(), healthIntakeHistory: vi.fn() },
}));

const history = vi.mocked(prontuarioService.history);
const intakeHistory = vi.mocked(prontuarioService.healthIntakeHistory);
const event = (version: number): ProntuarioHistoryEvent => ({
  id: `event-${version}`, recordId: 'record-1', alunoId: 'student-1', contractId: 'contract-1',
  entityType: 'goal', entityId: 'goal-1', version, action: 'updated',
  snapshot: { title: `Meta ${version}` }, actorUserId: 'user-1', source: 'prnt-api',
  createdAt: '2026-10-13T10:00:00Z',
});
const intake = (revision: number): ProntuarioHealthIntakeRevision => ({
  id: `intake-${revision}`, intakeId: 'form-1', contractId: 'contract-1', alunoId: 'student-1',
  revision, sourceVersion: revision, formVersion: 'health-intake-v1', sourceType: 'student',
  sourceReference: null, actorUserId: 'user-1', snapshot: { mainGoal: `Meta ${revision}` },
  createdAt: '2026-10-13T10:00:00Z',
});
const page = Array.from({ length: 100 }, (_, index) => event(index + 1));
const intakePage = Array.from({ length: 100 }, (_, index) => intake(index + 1));
const permitted = { summary: true, goals: true, anamnesis: false,
  activity: false, meds: false, pain: false, discomforts: false };

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => cleanup());

describe('PRNT clinical history pagination', () => {
  it('loads older versions, retains earlier events and resets when the record changes', async () => {
    history.mockImplementation(async (recordId, _type, options) => {
      if (recordId === 'record-2') return [event(400)];
      return options?.skip === 100 ? [event(101)] : page;
    });
    const view = render(<ProntuarioVersionHistory recordId="record-1" allowed={permitted} refreshToken="initial" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carregar versões anteriores' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Carregar versões anteriores' }));
    await waitFor(() => expect(screen.getByText(/Versão 101/)).toBeTruthy());
    expect(screen.getByText(/Versão 1 ·/)).toBeTruthy();
    expect(history).toHaveBeenCalledWith('record-1', 'record', { skip: 100 });
    expect(screen.queryByRole('button', { name: 'Carregar versões anteriores' })).toBeNull();
    view.rerender(<ProntuarioVersionHistory recordId="record-2" allowed={permitted} refreshToken="initial" />);
    await waitFor(() => expect(screen.getByText(/Versão 400/)).toBeTruthy());
    expect(screen.queryByText(/Versão 101/)).toBeNull();
    expect(history).toHaveBeenCalledWith('record-2', 'record', { skip: 0 });
  });

  it('pages original Anamnese revisions instead of truncating after 100', async () => {
    intakeHistory.mockImplementation(async (_studentId, options) =>
      options?.skip === 100 ? [intake(101)] : intakePage);
    render(<ProntuarioHealthIntakeHistory alunoId="student-1" refreshToken="initial" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carregar versões anteriores' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Carregar versões anteriores' }));
    await waitFor(() => expect(screen.getByText(/Versão 101/)).toBeTruthy());
    expect(intakeHistory).toHaveBeenCalledWith('student-1', { skip: 100 });
    expect(screen.getByText(/Versão 1 ·/)).toBeTruthy();
  });

  it('does not fetch a hidden history block', async () => {
    render(<ProntuarioVersionHistory recordId="record-1"
      allowed={{ ...permitted, summary: false, goals: false }} refreshToken="initial" />);
    expect(history).not.toHaveBeenCalled();
  });
});
