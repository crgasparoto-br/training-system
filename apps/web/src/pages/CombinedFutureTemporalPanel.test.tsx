import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsolidatedCombinedReviewSnapshot } from '@corrida/types';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';
import { CombinedFutureTemporalPanel } from './CombinedFutureTemporalPanel';

vi.mock('../services/consolidated-prescription.service', () => ({
  consolidatedPrescriptionService: {
    getFutureBookingCandidates: vi.fn(),
    previewFutureTemporal: vi.fn(),
  },
}));

const summary: ConsolidatedCombinedReviewSnapshot = {
  protocolVersion: 'combined-conflict-v1', assemblyVersionId: 'assembly-v4', assemblyVersion: 4,
  source: 'persisted_assembly', state: 'no_active_rules', coverage: 'partial', activeRuleCount: 0,
  capacitySources: [
    { capacity: 'cyclic', capacityPrescriptionVersionId: 'cyclic-v1', capacityVersion: 1 },
    { capacity: 'resisted', capacityPrescriptionVersionId: 'resisted-v2', capacityVersion: 2 },
  ],
  mayConcludeNoConflict: false, changesWorkoutAutomatically: false,
};
const bookings = [{
  bookingId: 'booking-1',
  bookingDate: '2026-11-13',
  startTime: '08:00', endTime: '09:00',
  sourceUpdatedAt: '2026-11-06T12:00:00.000Z',
}];
const response = {
  protocolVersion: 'combined-conflict-v1' as const,
  assemblyVersionId: 'assembly-v4', assemblyVersion: 4,
  timeZone: 'UTC', timeZoneBasis: 'explicit_preview_assumption' as const,
  coverage: 'partial' as const, state: 'no_active_rules' as const,
  temporalEvidenceStatus: 'verified_bindings_only' as const,
  mappedSessions: [{
    bookingId: 'booking-1', bookingVersion: '2026-11-06T12:00:00.000Z',
    assemblyVersionId: 'assembly-v4', capacity: 'cyclic' as const,
    capacityPrescriptionVersionId: 'cyclic-v1', capacityVersion: 1,
    startAtUtc: '2026-11-13T08:00:00.000Z', endAtUtc: '2026-11-13T09:00:00.000Z',
    proof: 'verified' as const,
  }],
  gaps: [], unlinkedCapacities: ['resisted' as const], evaluations: [],
  mayConcludeNoConflict: false as const,
  changesWorkoutAutomatically: false as const,
};

function page(overrides: Partial<ComponentProps<typeof CombinedFutureTemporalPanel>> = {}) {
  return <CombinedFutureTemporalPanel
    alunoId="student-a" contractId="tenant-a"
    currentVersion={4} summary={summary}
    authorizationKey="actor-a" canReadAgenda dirty={false}
    {...overrides}
  />;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates).mockResolvedValue(bookings);
  vi.mocked(consolidatedPrescriptionService.previewFutureTemporal).mockResolvedValue(response);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('future temporal review UI binding', () => {
  it('never fetches agenda when the actor does not have its permission', async () => {
    render(page({ canReadAgenda: false }));
    expect(screen.getByText(/exige acesso à Montagem e à Agenda/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Consultar agendamentos futuros/i })).not.toBeInTheDocument();
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).not.toHaveBeenCalled();
  });

  it('requires explicit booking-to-capacity selection and timezone confirmation', async () => {
    const user = userEvent.setup();
    render(page());
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText(/Agendamento: booking-1/)).toBeInTheDocument();
    expect(consolidatedPrescriptionService.previewFutureTemporal).not.toHaveBeenCalled();

    const temporal = screen.getByRole('region', { name: 'Avaliação temporal futura' });
    const checkboxes = temporal.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);
    await user.click(checkboxes[0]);
    await user.clear(screen.getByLabelText(/Fuso IANA da agenda/i));
    await user.type(screen.getByLabelText(/Fuso IANA da agenda/i), 'UTC');
    expect(screen.getByRole('button', { name: 'Conferir intervalos futuros' })).toBeDisabled();
    await user.click(checkboxes[2]);
    await user.click(screen.getByRole('button', { name: 'Conferir intervalos futuros' }));
    await waitFor(() => expect(consolidatedPrescriptionService.previewFutureTemporal).toHaveBeenCalledWith(
      'student-a', expect.objectContaining({
        expectedCurrentVersion: 4,
        timeZone: 'UTC',
        bindings: [{
          bookingId: 'booking-1',
          capacityPrescriptionVersionId: 'cyclic-v1',
          expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z',
        }],
      })
    ));
    expect(await screen.findByText(/Regras clínicas ainda não ativas/i)).toBeInTheDocument();
    expect(screen.getByText(/Capacidades sem horário vinculado/i)).toBeInTheDocument();
    expect(screen.getByText(/Não conclua que não há riscos/)).toBeInTheDocument();
  });

  it('A-539-001 renews the POST horizon after a long manual review without losing mappings', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'));
    const user = userEvent.setup();
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText(/Agendamento: booking-1/)).toBeInTheDocument();
    const get = vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates);
    expect(get).toHaveBeenCalledWith('student-a', '2026-11-06T12:00:00.000Z', '2026-12-06T12:00:00.000Z');

    const temporal = screen.getByRole('region', { name: 'Avaliação temporal futura' });
    const checkboxes = temporal.querySelectorAll('input[type="checkbox"]');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[2]);
    vi.setSystemTime(new Date('2026-11-06T12:06:00.000Z'));
    await user.click(screen.getByRole('button', { name: 'Conferir intervalos futuros' }));

    await waitFor(() => expect(consolidatedPrescriptionService.previewFutureTemporal).toHaveBeenCalledWith(
      'student-a', expect.objectContaining({
        windowStart: '2026-11-06T12:06:00.000Z',
        windowEnd: '2026-12-06T12:06:00.000Z',
        timeZone: expect.any(String),
        bindings: [{
          bookingId: 'booking-1',
          capacityPrescriptionVersionId: 'cyclic-v1',
          expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z',
        }],
      })
    ));
    expect(checkboxes[0]).toBeChecked();
    expect(await screen.findByText(/Regras clínicas ainda não ativas/i)).toBeInTheDocument();
  });

  it('retains valid bindings on transient preview failure, but drops them on a proven stale source', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.previewFutureTemporal)
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockRejectedValueOnce({ response: { status: 409 } });
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText(/Agendamento: booking-1/)).toBeInTheDocument();
    const temporal = screen.getByRole('region', { name: 'Avaliação temporal futura' });
    const checkboxes = temporal.querySelectorAll('input[type="checkbox"]');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[2]);
    const evaluate = screen.getByRole('button', { name: 'Conferir intervalos futuros' });
    await user.click(evaluate);
    expect(await screen.findByText(/Os vínculos foram preservados/i)).toBeInTheDocument();
    expect(screen.getByText(/Agendamento: booking-1/)).toBeInTheDocument();
    expect(checkboxes[0]).toBeChecked();
    await user.click(evaluate);
    expect(await screen.findByText(/As fontes, versões ou permissões mudaram/i)).toBeInTheDocument();
    expect(screen.queryByText(/Agendamento: booking-1/)).not.toBeInTheDocument();
  });

  it('labels legacy bookings as unverified rather than assigning the wrong civil day', async () => {
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates).mockResolvedValueOnce([
      { ...bookings[0], bookingDate: null },
    ]);
    const user = userEvent.setup();
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText(/Data civil não comprovada \(registro legado\)/i)).toBeInTheDocument();
  });

  it('does not display old results after timezone or permission changes', async () => {
    const user = userEvent.setup();
    const view = render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText(/Agendamento: booking-1/)).toBeInTheDocument();
    const temporal = screen.getByRole('region', { name: 'Avaliação temporal futura' });
    const checkboxes = temporal.querySelectorAll('input[type="checkbox"]');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[2]);
    await user.click(screen.getByRole('button', { name: 'Conferir intervalos futuros' }));
    expect(await screen.findByText(/Regras clínicas ainda não ativas/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Fuso IANA da agenda/i), '/Other');
    expect(screen.queryByText(/Regras clínicas ainda não ativas/i)).not.toBeInTheDocument();
    view.rerender(page({ authorizationKey: 'actor-new-scope', canReadAgenda: false }));
    expect(screen.queryByText(/Agendamento: booking-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Regras clínicas ainda não ativas/i)).not.toBeInTheDocument();
  });

  it('discards stale async results when another student is selected', async () => {
    let resolve!: (value: typeof bookings) => void;
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates).mockImplementationOnce(
      () => new Promise((done) => { resolve = done; })
    );
    const user = userEvent.setup();
    const view = render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    view.rerender(page({ alunoId: 'student-b' }));
    resolve(bookings);
    await waitFor(() => expect(screen.queryByText(/Agendamento: booking-1/)).not.toBeInTheDocument());
  });
});
