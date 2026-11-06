/**
 * AgendaBooking.bookingDate is a legacy server-local instant used by agenda availability.
 * The separate DATE column is the authoritative civil day for future temporal proofs.
 * Never reconstruct a missing civil day from the host timezone or an address.
 */
export function parseBookingCivilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Data civil da agenda inválida. Use YYYY-MM-DD.');
  }
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
    throw new Error('Data civil da agenda inválida. Use YYYY-MM-DD.');
  }
  return day;
}
