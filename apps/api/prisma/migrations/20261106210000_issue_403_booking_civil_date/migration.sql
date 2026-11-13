-- Preserve legacy AgendaBooking.bookingDate; the civil day provided by new bookings is explicit.
-- Older rows remain NULL: a host-local instant cannot prove the original civil date.
ALTER TABLE "AgendaBooking" ADD COLUMN "bookingCivilDate" DATE;
