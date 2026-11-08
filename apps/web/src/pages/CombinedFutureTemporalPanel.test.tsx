import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function bookingCheckbox(bookingId: string, capacityIndex = 0) {
  const description = screen.getByText(new RegExp(`^Agendamento: ${bookingId} • Versão`));
  const box = description.closest('fieldset')?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[capacityIndex];
  if (!box) throw new Error(`Checkbox for booking ${bookingId} not found`);
  return box;
}

function bookingPage(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...bookings[0], bookingId: `booking-${start + index}`,
  }));
}

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
  it('A-539-003 navigates a second page after 80 bookings and allows a narrower UTC range', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'));
    const user = userEvent.setup();
    const eighty = Array.from({ length: 80 }, (_, i) => ({
      ...bookings[0], bookingId: `booking-${i + 1}`,
    }));
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates)
      .mockResolvedValueOnce(eighty)
      .mockResolvedValueOnce(bookings)
      .mockResolvedValueOnce(bookings);
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText('Página 1 da consulta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('Página 2 da consulta')).toBeInTheDocument();
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).toHaveBeenNthCalledWith(
      2, 'student-a', '2026-11-06T12:00:00.000Z', '2026-12-06T12:00:00.000Z', 2
    );

    await user.selectOptions(screen.getByLabelText('Período da consulta à agenda'), 'custom');
    fireEvent.change(screen.getByLabelText('Início do recorte (UTC)'), {
      target: { value: '2026-11-13T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Fim do recorte (UTC)'), {
      target: { value: '2026-11-13T10:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByText(/Agendamento: booking-1/)).toBeInTheDocument();
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).toHaveBeenLastCalledWith(
      'student-a', '2026-11-13T08:00:00.000Z', '2026-11-13T10:00:00.000Z', 1
    );

    const temporal = screen.getByRole('region', { name: 'Avaliação temporal futura' });
    const checkboxes = temporal.querySelectorAll('input[type="checkbox"]');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[2]);
    await user.click(screen.getByRole('button', { name: 'Conferir intervalos futuros' }));
    await waitFor(() => expect(consolidatedPrescriptionService.previewFutureTemporal).toHaveBeenCalledWith(
      'student-a', expect.objectContaining({
        windowStart: '2026-11-13T08:00:00.000Z', windowEnd: '2026-11-13T10:00:00.000Z',
        bindings: [{ bookingId: 'booking-1', capacityPrescriptionVersionId: 'cyclic-v1',
          expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z' }],
      })
    ));
  });

  it('R-539-01 preserves bookings and their source revisions across pages 1 and 2 in one preview', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'));
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates)
      .mockResolvedValueOnce(bookingPage(1, 80))
      .mockResolvedValueOnce([{ ...bookings[0], bookingId: 'booking-81',
        sourceUpdatedAt: '2026-11-07T12:00:00.000Z' }])
      .mockResolvedValueOnce(bookingPage(1, 80));

    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    await screen.findByText(/Agendamento: booking-80/);
    await user.click(bookingCheckbox('booking-1'));
    await user.click(bookingCheckbox('booking-2', 1));
    expect(screen.getByText('2 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('Página 2 da consulta')).toBeInTheDocument();
    expect(screen.getByText('2 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(bookingCheckbox('booking-81'));
    await user.click(bookingCheckbox('booking-81', 1));
    expect(screen.getByText('3 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByText('Página 1 da consulta')).toBeInTheDocument();
    expect(bookingCheckbox('booking-1')).toBeChecked();
    expect(bookingCheckbox('booking-2', 1)).toBeChecked();
    await user.click(screen.getByLabelText(/Confirmei que o fuso IANA informado/i));
    await user.click(screen.getByRole('button', { name: 'Conferir intervalos futuros' }));
    await waitFor(() => expect(consolidatedPrescriptionService.previewFutureTemporal).toHaveBeenCalledWith(
      'student-a', expect.objectContaining({
        bindings: [
          { bookingId: 'booking-1', capacityPrescriptionVersionId: 'cyclic-v1',
            expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z' },
          { bookingId: 'booking-2', capacityPrescriptionVersionId: 'resisted-v2',
            expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z' },
          { bookingId: 'booking-81', capacityPrescriptionVersionId: 'cyclic-v1',
            expectedBookingUpdatedAt: '2026-11-07T12:00:00.000Z' },
          { bookingId: 'booking-81', capacityPrescriptionVersionId: 'resisted-v2',
            expectedBookingUpdatedAt: '2026-11-07T12:00:00.000Z' },
        ],
      })
    ));
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).toHaveBeenNthCalledWith(
      3, 'student-a', '2026-11-06T12:00:00.000Z', '2026-12-06T12:00:00.000Z', 1
    );
  });

  it('R-539-01 enforces 80 distinct bookings but allows multiple capacities for the same booking', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates)
      .mockImplementation((_studentId, _start, _end, pageNumber) => Promise.resolve(
        pageNumber === 2 ? bookingPage(81, 1) : bookingPage(1, 80)
      ));
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    await screen.findByText(/Agendamento: booking-80/);
    for (let number = 1; number <= 80; number += 1) {
      fireEvent.click(bookingCheckbox(`booking-${number}`));
    }
    expect(screen.getByText('80 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(bookingCheckbox('booking-1', 1));
    expect(screen.getByText('80 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText(/Agendamento: booking-81/);
    await user.click(bookingCheckbox('booking-81'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/até 80 agendamentos distintos/i);
    expect(bookingCheckbox('booking-81')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    await screen.findByText('Página 1 da consulta');
    await user.click(bookingCheckbox('booking-2'));
    expect(screen.getByText('79 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText(/Agendamento: booking-81/);
    await user.click(bookingCheckbox('booking-81'));
    expect(bookingCheckbox('booking-81')).toBeChecked();
    expect(screen.getByText('80 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.getByText('0 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir intervalos futuros' })).toBeDisabled();
  });

  it('R-539-01 discards only changed source revisions when revisiting an earlier page', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates)
      .mockResolvedValueOnce(bookingPage(1, 80))
      .mockResolvedValueOnce(bookingPage(81, 1))
      .mockResolvedValueOnce(bookingPage(1, 80).map((booking) => booking.bookingId === 'booking-1'
        ? { ...booking, sourceUpdatedAt: '2026-11-08T12:00:00.000Z' } : booking));
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    await screen.findByText(/Agendamento: booking-80/);
    await user.click(bookingCheckbox('booking-1'));
    await user.click(bookingCheckbox('booking-2', 1));
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText(/Agendamento: booking-81/);
    await user.click(bookingCheckbox('booking-81'));
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/agendamentos alterados/i);
    expect(bookingCheckbox('booking-1')).not.toBeChecked();
    expect(bookingCheckbox('booking-2', 1)).toBeChecked();
    expect(screen.getByText('2 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Confirmei que o fuso IANA informado/i));
    await user.click(screen.getByRole('button', { name: 'Conferir intervalos futuros' }));
    await waitFor(() => expect(consolidatedPrescriptionService.previewFutureTemporal).toHaveBeenCalledWith(
      'student-a', expect.objectContaining({ bindings: [
        { bookingId: 'booking-2', capacityPrescriptionVersionId: 'resisted-v2',
          expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z' },
        { bookingId: 'booking-81', capacityPrescriptionVersionId: 'cyclic-v1',
          expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z' },
      ] })
    ));
  });

  it('R-539-01 retains selections after a transient page load failure and resets on a new query', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates)
      .mockResolvedValueOnce(bookingPage(1, 80))
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(bookingPage(81, 1))
      .mockResolvedValueOnce(bookingPage(1, 80));
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    await screen.findByText(/Agendamento: booking-80/);
    await user.click(bookingCheckbox('booking-1'));
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/seleção foi preservada/i);
    expect(screen.getByText('Página 1 da consulta')).toBeInTheDocument();
    expect(bookingCheckbox('booking-1')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText(/Agendamento: booking-81/);
    expect(screen.getByText('1 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recarregar agendamentos futuros' }));
    await screen.findByText('Página 1 da consulta');
    expect(bookingCheckbox('booking-1')).not.toBeChecked();
    expect(screen.getByText('0 de 80 agendamentos selecionados nesta consulta')).toBeInTheDocument();
  });

  it('R-539-01 revokes all paginated selections on proven authorization failure', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getFutureBookingCandidates)
      .mockResolvedValueOnce(bookingPage(1, 80))
      .mockRejectedValueOnce({ response: { status: 403 } });
    render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    await screen.findByText(/Agendamento: booking-80/);
    await user.click(bookingCheckbox('booking-1'));
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/O acesso ou as fontes da agenda mudaram/i);
    expect(screen.queryByText(/Agendamento: booking-1 • Versão/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conferir intervalos futuros' })).not.toBeInTheDocument();
  });

  it('R-539-01 drops paginated selection after local edits even when the draft is later reverted', async () => {
    const user = userEvent.setup();
    const view = render(page());
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    await screen.findByText(/Agendamento: booking-1/);
    await user.click(bookingCheckbox('booking-1'));
    view.rerender(page({ dirty: true }));
    expect(screen.queryByText(/Agendamento: booking-1 • Versão/i)).not.toBeInTheDocument();
    view.rerender(page({ dirty: false }));
    expect(screen.queryByText(/Agendamento: booking-1 • Versão/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conferir intervalos futuros' })).not.toBeInTheDocument();
  });

  it('refuses an expired or more-than-31-day custom interval before calling the API', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'));
    const user = userEvent.setup();
    render(page());
    await user.selectOptions(screen.getByLabelText('Período da consulta à agenda'), 'custom');
    fireEvent.change(screen.getByLabelText('Início do recorte (UTC)'), {
      target: { value: '2026-11-13T11:00' },
    });
    fireEvent.change(screen.getByLabelText('Fim do recorte (UTC)'), {
      target: { value: '2026-11-13T10:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/período UTC válido/i);
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Fim do recorte (UTC)'), {
      target: { value: '2026-12-15T10:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Consultar agendamentos futuros' }));
    expect(consolidatedPrescriptionService.getFutureBookingCandidates).not.toHaveBeenCalled();
  });

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
    expect(get).toHaveBeenCalledWith('student-a', '2026-11-06T12:00:00.000Z', '2026-12-06T12:00:00.000Z', 1);

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
