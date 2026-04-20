import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { agendaService, type AgendaAvailability, type AgendaBooking, type AgendaBookingStatus, type AgendaBookingType, type AgendaMetadataResponse, type FixedScheduleSlot, type TrainingSpace } from '../services/agenda.service';
import { agendaCopy } from '../i18n/ptBR';

const weekDays = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function plusDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

export function Agenda() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<AgendaMetadataResponse>({ professores: [], alunos: [], spaces: [] });
  const [bookings, setBookings] = useState<AgendaBooking[]>([]);
  const [availabilities, setAvailabilities] = useState<AgendaAvailability[]>([]);
  const [fixedSlots, setFixedSlots] = useState<FixedScheduleSlot[]>([]);
  const [spaces, setSpaces] = useState<TrainingSpace[]>([]);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(toDateInput(today));
  const [dateTo, setDateTo] = useState(toDateInput(plusDays(today, 7)));

  const [bookingForm, setBookingForm] = useState({
    alunoId: '',
    professorId: '',
    bookingDate: toDateInput(today),
    startTime: '08:00',
    endTime: '09:00',
    bookingType: 'free' as AgendaBookingType,
    spaceId: '',
    fixedSlotId: '',
    notes: '',
  });

  const [availabilityForm, setAvailabilityForm] = useState({
    professorId: '',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '12:00',
  });

  const [fixedSlotForm, setFixedSlotForm] = useState({
    alunoId: '',
    professorId: '',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:00',
    spaceId: '',
    notes: '',
  });

  const [spaceForm, setSpaceForm] = useState({
    name: '',
    capacity: 1,
  });

  const alunoById = useMemo(
    () => new Map(metadata.alunos.map((aluno) => [aluno.id, aluno])),
    [metadata.alunos]
  );

  const selectedAluno = bookingForm.alunoId ? alunoById.get(bookingForm.alunoId) : undefined;
  const selectedFixedAluno = fixedSlotForm.alunoId ? alunoById.get(fixedSlotForm.alunoId) : undefined;

  const reloadData = async () => {
    const [meta, bookingItems, availabilityItems, fixedItems, spaceItems] = await Promise.all([
      agendaService.getMetadata(),
      agendaService.listBookings({ dateFrom, dateTo }),
      agendaService.listAvailabilities(),
      agendaService.listFixedSlots(),
      agendaService.listSpaces(),
    ]);
    setMetadata(meta);
    setBookings(bookingItems);
    setAvailabilities(availabilityItems);
    setFixedSlots(fixedItems);
    setSpaces(spaceItems);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await reloadData();
      } catch (err: any) {
        setError(err?.response?.data?.error || agendaCopy.loadError);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedAluno) return;
    setBookingForm((prev) => ({ ...prev, professorId: selectedAluno.professor.id }));
  }, [selectedAluno?.id]);

  useEffect(() => {
    if (!selectedFixedAluno) return;
    setFixedSlotForm((prev) => ({ ...prev, professorId: selectedFixedAluno.professor.id }));
  }, [selectedFixedAluno?.id]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleCreateBooking = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      await agendaService.createBooking({
        alunoId: bookingForm.alunoId,
        professorId: bookingForm.professorId,
        bookingDate: bookingForm.bookingDate,
        startTime: bookingForm.startTime,
        endTime: bookingForm.endTime,
        bookingType: bookingForm.bookingType,
        spaceId: bookingForm.spaceId || undefined,
        fixedSlotId: bookingForm.bookingType === 'fixed_makeup' ? bookingForm.fixedSlotId || undefined : undefined,
        notes: bookingForm.notes || undefined,
      });
      await reloadData();
      setSuccess(agendaCopy.bookingCreateSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.bookingCreateError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: AgendaBookingStatus) => {
    clearMessages();
    try {
      await agendaService.updateBookingStatus(bookingId, { status });
      await reloadData();
      setSuccess(agendaCopy.bookingStatusSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.bookingStatusError);
    }
  };

  const handleCreateAvailability = async () => {
    clearMessages();
    try {
      await agendaService.createAvailability(availabilityForm);
      await reloadData();
      setSuccess(agendaCopy.availabilityCreateSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.availabilityCreateError);
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    clearMessages();
    try {
      await agendaService.deleteAvailability(id);
      await reloadData();
      setSuccess(agendaCopy.availabilityDeleteSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.availabilityDeleteError);
    }
  };

  const handleCreateFixedSlot = async () => {
    clearMessages();
    try {
      await agendaService.createFixedSlot({
        alunoId: fixedSlotForm.alunoId,
        professorId: fixedSlotForm.professorId,
        dayOfWeek: fixedSlotForm.dayOfWeek,
        startTime: fixedSlotForm.startTime,
        endTime: fixedSlotForm.endTime,
        spaceId: fixedSlotForm.spaceId || undefined,
        notes: fixedSlotForm.notes || undefined,
      });
      await reloadData();
      setSuccess(agendaCopy.fixedSlotCreateSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.fixedSlotCreateError);
    }
  };

  const handleDeactivateFixedSlot = async (id: string) => {
    clearMessages();
    try {
      await agendaService.deactivateFixedSlot(id);
      await reloadData();
      setSuccess(agendaCopy.fixedSlotDeactivateSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.fixedSlotDeactivateError);
    }
  };

  const handleCreateSpace = async () => {
    clearMessages();
    try {
      await agendaService.createSpace(spaceForm);
      setSpaceForm({ name: '', capacity: 1 });
      await reloadData();
      setSuccess(agendaCopy.spaceCreateSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.spaceCreateError);
    }
  };

  const statusLabel: Record<AgendaBookingStatus, string> = {
    scheduled: 'Agendado',
    completed: 'Concluído',
    canceled: 'Cancelado',
    no_show: 'Falta',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Agenda</h1>
        <p className="text-muted-foreground">{agendaCopy.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{agendaCopy.title}</h1>
          <p className="text-muted-foreground mt-1">
            {agendaCopy.description}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{agendaCopy.from}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-md border px-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{agendaCopy.to}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-md border px-3 text-sm" />
          </div>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{agendaCopy.newBookingTitle}</CardTitle>
            <CardDescription>{agendaCopy.newBookingDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={bookingForm.alunoId}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, alunoId: e.target.value }))}
              className="h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">{agendaCopy.selectAluno}</option>
              {metadata.alunos.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>
                  {aluno.user.profile.name} ({aluno.schedulePlan === 'fixed' ? 'Fixo' : 'Livre'})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={bookingForm.bookingDate} onChange={(e) => setBookingForm((prev) => ({ ...prev, bookingDate: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
              <select value={bookingForm.bookingType} onChange={(e) => setBookingForm((prev) => ({ ...prev, bookingType: e.target.value as AgendaBookingType }))} className="h-10 rounded-md border px-3 text-sm">
                <option value="free">{agendaCopy.freeSchedule}</option>
                <option value="fixed_makeup">{agendaCopy.fixedMakeup}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={bookingForm.startTime} onChange={(e) => setBookingForm((prev) => ({ ...prev, startTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
              <input type="time" value={bookingForm.endTime} onChange={(e) => setBookingForm((prev) => ({ ...prev, endTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
            </div>

            <select value={bookingForm.spaceId} onChange={(e) => setBookingForm((prev) => ({ ...prev, spaceId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
              <option value="">{agendaCopy.noSpaceDefined}</option>
              {spaces.filter((space) => space.isActive).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} (capacidade {space.capacity})
                </option>
              ))}
            </select>

            {bookingForm.bookingType === 'fixed_makeup' && (
              <select value={bookingForm.fixedSlotId} onChange={(e) => setBookingForm((prev) => ({ ...prev, fixedSlotId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
                <option value="">{agendaCopy.sourceFixedSlot}</option>
                {fixedSlots
                  .filter((slot) => slot.isActive && (!bookingForm.alunoId || slot.alunoId === bookingForm.alunoId))
                  .map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.aluno.user.profile.name} - {weekDays.find((day) => day.value === slot.dayOfWeek)?.label} {slot.startTime}-{slot.endTime}
                    </option>
                  ))}
              </select>
            )}

            <textarea
              value={bookingForm.notes}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              placeholder={agendaCopy.notesPlaceholder}
            />

            <Button
              onClick={handleCreateBooking}
              isLoading={submitting}
              disabled={!bookingForm.alunoId || !bookingForm.professorId}
            >
              {agendaCopy.createBooking}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{agendaCopy.spacesTitle}</CardTitle>
            <CardDescription>{agendaCopy.spacesDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input
                value={spaceForm.name}
                onChange={(e) => setSpaceForm((prev) => ({ ...prev, name: e.target.value }))}
                className="h-10 rounded-md border px-3 text-sm"
                placeholder={agendaCopy.spaceNamePlaceholder}
              />
              <input
                type="number"
                min={1}
                value={spaceForm.capacity}
                onChange={(e) => setSpaceForm((prev) => ({ ...prev, capacity: Number(e.target.value) || 1 }))}
                className="h-10 rounded-md border px-3 text-sm"
                placeholder={agendaCopy.capacityPlaceholder}
              />
              <Button onClick={handleCreateSpace}>{agendaCopy.add}</Button>
            </div>
            <div className="space-y-2">
              {spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">{agendaCopy.noSpaces}</p>
              ) : (
                spaces.map((space) => (
                  <div key={space.id} className="rounded-md border p-2 text-sm">
                    <strong>{space.name}</strong> - capacidade {space.capacity} - {space.isActive ? 'Ativo' : 'Inativo'}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{agendaCopy.professorAvailabilityTitle}</CardTitle>
            <CardDescription>{agendaCopy.professorAvailabilityDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select value={availabilityForm.professorId} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, professorId: e.target.value }))} className="h-10 rounded-md border px-3 text-sm">
                <option value="">{agendaCopy.selectProfessor}</option>
                {metadata.professores.map((professor) => (
                  <option key={professor.id} value={professor.id}>{professor.user.profile.name}</option>
                ))}
              </select>
              <select value={availabilityForm.dayOfWeek} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, dayOfWeek: Number(e.target.value) }))} className="h-10 rounded-md border px-3 text-sm">
                {weekDays.map((day) => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={availabilityForm.startTime} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, startTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
              <input type="time" value={availabilityForm.endTime} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, endTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
            </div>
            <Button onClick={handleCreateAvailability} disabled={!availabilityForm.professorId}>{agendaCopy.addAvailability}</Button>

            <div className="space-y-2">
              {availabilities.length === 0 ? (
                <p className="text-sm text-muted-foreground">{agendaCopy.noAvailability}</p>
              ) : (
                availabilities.map((item) => (
                  <div key={item.id} className="rounded-md border p-2 text-sm flex items-center justify-between">
                    <span>
                      <strong>{item.professor.user.profile.name}</strong> - {weekDays.find((day) => day.value === item.dayOfWeek)?.label} {item.startTime}-{item.endTime}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteAvailability(item.id)}>{agendaCopy.remove}</Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{agendaCopy.fixedTitle}</CardTitle>
            <CardDescription>{agendaCopy.fixedDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select value={fixedSlotForm.alunoId} onChange={(e) => setFixedSlotForm((prev) => ({ ...prev, alunoId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
              <option value="">{agendaCopy.selectAluno}</option>
              {metadata.alunos.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>
                  {aluno.user.profile.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <select value={fixedSlotForm.dayOfWeek} onChange={(e) => setFixedSlotForm((prev) => ({ ...prev, dayOfWeek: Number(e.target.value) }))} className="h-10 rounded-md border px-3 text-sm">
                {weekDays.map((day) => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
              <input type="time" value={fixedSlotForm.startTime} onChange={(e) => setFixedSlotForm((prev) => ({ ...prev, startTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
              <input type="time" value={fixedSlotForm.endTime} onChange={(e) => setFixedSlotForm((prev) => ({ ...prev, endTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
            </div>
            <select value={fixedSlotForm.spaceId} onChange={(e) => setFixedSlotForm((prev) => ({ ...prev, spaceId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
              <option value="">{agendaCopy.noSpaceDefined}</option>
              {spaces.filter((space) => space.isActive).map((space) => (
                <option key={space.id} value={space.id}>{space.name}</option>
              ))}
            </select>
            <Button onClick={handleCreateFixedSlot} disabled={!fixedSlotForm.alunoId || !fixedSlotForm.professorId}>{agendaCopy.registerFixed}</Button>

            <div className="space-y-2">
              {fixedSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{agendaCopy.noFixed}</p>
              ) : (
                fixedSlots.map((slot) => (
                  <div key={slot.id} className="rounded-md border p-2 text-sm flex items-center justify-between">
                    <span>
                      <strong>{slot.aluno.user.profile.name}</strong> - {weekDays.find((day) => day.value === slot.dayOfWeek)?.label} {slot.startTime}-{slot.endTime} ({slot.isActive ? 'Ativo' : 'Inativo'})
                    </span>
                    {slot.isActive && (
                      <Button variant="outline" size="sm" onClick={() => handleDeactivateFixedSlot(slot.id)}>
                        {agendaCopy.deactivate}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{agendaCopy.bookingsTitle}</CardTitle>
          <CardDescription>{agendaCopy.bookingsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{agendaCopy.noBookings}</p>
          ) : (
            bookings.map((booking) => (
              <div key={booking.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <strong>{booking.aluno.user.profile.name}</strong> com {booking.professor.user.profile.name} em{' '}
                    {new Date(booking.bookingDate).toLocaleDateString('pt-BR')} - {booking.startTime}-{booking.endTime}
                    {booking.space ? ` - ${booking.space.name}` : ''}
                    <span className="ml-2 text-xs text-muted-foreground">
                      [{booking.bookingType === 'fixed_makeup' ? 'Reposição' : 'Livre'}]
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{statusLabel[booking.status]}</span>
                    {booking.status === 'scheduled' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleUpdateBookingStatus(booking.id, 'completed')}>
                          {agendaCopy.complete}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleUpdateBookingStatus(booking.id, 'no_show')}>
                          {agendaCopy.noShow}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleUpdateBookingStatus(booking.id, 'canceled')}>
                          {agendaCopy.cancel}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}


