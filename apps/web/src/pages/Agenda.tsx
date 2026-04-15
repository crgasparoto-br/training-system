import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { agendaService, type AgendaAvailability, type AgendaBooking, type AgendaBookingStatus, type AgendaBookingType, type AgendaMetadataResponse, type FixedScheduleSlot, type TrainingSpace } from '../services/agenda.service';

const weekDays = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terca' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sabado' },
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

  const [metadata, setMetadata] = useState<AgendaMetadataResponse>({ educators: [], athletes: [], spaces: [] });
  const [bookings, setBookings] = useState<AgendaBooking[]>([]);
  const [availabilities, setAvailabilities] = useState<AgendaAvailability[]>([]);
  const [fixedSlots, setFixedSlots] = useState<FixedScheduleSlot[]>([]);
  const [spaces, setSpaces] = useState<TrainingSpace[]>([]);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(toDateInput(today));
  const [dateTo, setDateTo] = useState(toDateInput(plusDays(today, 7)));

  const [bookingForm, setBookingForm] = useState({
    athleteId: '',
    educatorId: '',
    bookingDate: toDateInput(today),
    startTime: '08:00',
    endTime: '09:00',
    bookingType: 'free' as AgendaBookingType,
    spaceId: '',
    fixedSlotId: '',
    notes: '',
  });

  const [availabilityForm, setAvailabilityForm] = useState({
    educatorId: '',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '12:00',
  });

  const [fixedSlotForm, setFixedSlotForm] = useState({
    athleteId: '',
    educatorId: '',
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

  const athleteById = useMemo(
    () => new Map(metadata.athletes.map((athlete) => [athlete.id, athlete])),
    [metadata.athletes]
  );

  const selectedAthlete = bookingForm.athleteId ? athleteById.get(bookingForm.athleteId) : undefined;
  const selectedFixedAthlete = fixedSlotForm.athleteId ? athleteById.get(fixedSlotForm.athleteId) : undefined;

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
        setError(err?.response?.data?.error || 'Erro ao carregar agenda.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedAthlete) return;
    setBookingForm((prev) => ({ ...prev, educatorId: selectedAthlete.educator.id }));
  }, [selectedAthlete?.id]);

  useEffect(() => {
    if (!selectedFixedAthlete) return;
    setFixedSlotForm((prev) => ({ ...prev, educatorId: selectedFixedAthlete.educator.id }));
  }, [selectedFixedAthlete?.id]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleCreateBooking = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      await agendaService.createBooking({
        athleteId: bookingForm.athleteId,
        educatorId: bookingForm.educatorId,
        bookingDate: bookingForm.bookingDate,
        startTime: bookingForm.startTime,
        endTime: bookingForm.endTime,
        bookingType: bookingForm.bookingType,
        spaceId: bookingForm.spaceId || undefined,
        fixedSlotId: bookingForm.bookingType === 'fixed_makeup' ? bookingForm.fixedSlotId || undefined : undefined,
        notes: bookingForm.notes || undefined,
      });
      await reloadData();
      setSuccess('Agendamento criado com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel criar o agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: AgendaBookingStatus) => {
    clearMessages();
    try {
      await agendaService.updateBookingStatus(bookingId, { status });
      await reloadData();
      setSuccess('Status atualizado.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel atualizar o status.');
    }
  };

  const handleCreateAvailability = async () => {
    clearMessages();
    try {
      await agendaService.createAvailability(availabilityForm);
      await reloadData();
      setSuccess('Disponibilidade cadastrada com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel cadastrar disponibilidade.');
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    clearMessages();
    try {
      await agendaService.deleteAvailability(id);
      await reloadData();
      setSuccess('Disponibilidade removida.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel remover disponibilidade.');
    }
  };

  const handleCreateFixedSlot = async () => {
    clearMessages();
    try {
      await agendaService.createFixedSlot({
        athleteId: fixedSlotForm.athleteId,
        educatorId: fixedSlotForm.educatorId,
        dayOfWeek: fixedSlotForm.dayOfWeek,
        startTime: fixedSlotForm.startTime,
        endTime: fixedSlotForm.endTime,
        spaceId: fixedSlotForm.spaceId || undefined,
        notes: fixedSlotForm.notes || undefined,
      });
      await reloadData();
      setSuccess('Horario fixo cadastrado com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel cadastrar horario fixo.');
    }
  };

  const handleDeactivateFixedSlot = async (id: string) => {
    clearMessages();
    try {
      await agendaService.deactivateFixedSlot(id);
      await reloadData();
      setSuccess('Horario fixo inativado.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel inativar horario fixo.');
    }
  };

  const handleCreateSpace = async () => {
    clearMessages();
    try {
      await agendaService.createSpace(spaceForm);
      setSpaceForm({ name: '', capacity: 1 });
      await reloadData();
      setSuccess('Espaco criado com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nao foi possivel criar o espaco.');
    }
  };

  const statusLabel: Record<AgendaBookingStatus, string> = {
    scheduled: 'Agendado',
    completed: 'Concluido',
    canceled: 'Cancelado',
    no_show: 'Falta',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Agenda</h1>
        <p className="text-muted-foreground">Carregando agenda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Agenda</h1>
          <p className="text-muted-foreground mt-1">
            Controle de capacidade do espaco, disponibilidade do professor e agendamentos (livre/reposicao).
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">De</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-md border px-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Ate</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-md border px-3 text-sm" />
          </div>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Novo Agendamento</CardTitle>
            <CardDescription>Use para horario livre e reposicao do horario fixo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={bookingForm.athleteId}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, athleteId: e.target.value }))}
              className="h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Selecione o aluno</option>
              {metadata.athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.user.profile.name} ({athlete.schedulePlan === 'fixed' ? 'Fixo' : 'Livre'})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={bookingForm.bookingDate} onChange={(e) => setBookingForm((prev) => ({ ...prev, bookingDate: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
              <select value={bookingForm.bookingType} onChange={(e) => setBookingForm((prev) => ({ ...prev, bookingType: e.target.value as AgendaBookingType }))} className="h-10 rounded-md border px-3 text-sm">
                <option value="free">Horario Livre</option>
                <option value="fixed_makeup">Reposicao (Fixo)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={bookingForm.startTime} onChange={(e) => setBookingForm((prev) => ({ ...prev, startTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
              <input type="time" value={bookingForm.endTime} onChange={(e) => setBookingForm((prev) => ({ ...prev, endTime: e.target.value }))} className="h-10 rounded-md border px-3 text-sm" />
            </div>

            <select value={bookingForm.spaceId} onChange={(e) => setBookingForm((prev) => ({ ...prev, spaceId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
              <option value="">Sem espaco definido</option>
              {spaces.filter((space) => space.isActive).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} (capacidade {space.capacity})
                </option>
              ))}
            </select>

            {bookingForm.bookingType === 'fixed_makeup' && (
              <select value={bookingForm.fixedSlotId} onChange={(e) => setBookingForm((prev) => ({ ...prev, fixedSlotId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
                <option value="">Horario fixo de origem (opcional)</option>
                {fixedSlots
                  .filter((slot) => slot.isActive && (!bookingForm.athleteId || slot.athleteId === bookingForm.athleteId))
                  .map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.athlete.user.profile.name} - {weekDays.find((day) => day.value === slot.dayOfWeek)?.label} {slot.startTime}-{slot.endTime}
                    </option>
                  ))}
              </select>
            )}

            <textarea
              value={bookingForm.notes}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              placeholder="Observacoes (opcional)"
            />

            <Button
              onClick={handleCreateBooking}
              isLoading={submitting}
              disabled={!bookingForm.athleteId || !bookingForm.educatorId}
            >
              Criar Agendamento
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Espacos e Capacidades</CardTitle>
            <CardDescription>Controle da capacidade para cruzar com os horarios.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input
                value={spaceForm.name}
                onChange={(e) => setSpaceForm((prev) => ({ ...prev, name: e.target.value }))}
                className="h-10 rounded-md border px-3 text-sm"
                placeholder="Nome do espaco"
              />
              <input
                type="number"
                min={1}
                value={spaceForm.capacity}
                onChange={(e) => setSpaceForm((prev) => ({ ...prev, capacity: Number(e.target.value) || 1 }))}
                className="h-10 rounded-md border px-3 text-sm"
                placeholder="Capacidade"
              />
              <Button onClick={handleCreateSpace}>Adicionar</Button>
            </div>
            <div className="space-y-2">
              {spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum espaco cadastrado.</p>
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
            <CardTitle>Disponibilidade do Professor</CardTitle>
            <CardDescription>Janela de atendimento usada para validar agendamentos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select value={availabilityForm.educatorId} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, educatorId: e.target.value }))} className="h-10 rounded-md border px-3 text-sm">
                <option value="">Selecione o professor</option>
                {metadata.educators.map((educator) => (
                  <option key={educator.id} value={educator.id}>{educator.user.profile.name}</option>
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
            <Button onClick={handleCreateAvailability} disabled={!availabilityForm.educatorId}>Adicionar Disponibilidade</Button>

            <div className="space-y-2">
              {availabilities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma disponibilidade cadastrada.</p>
              ) : (
                availabilities.map((item) => (
                  <div key={item.id} className="rounded-md border p-2 text-sm flex items-center justify-between">
                    <span>
                      <strong>{item.educator.user.profile.name}</strong> - {weekDays.find((day) => day.value === item.dayOfWeek)?.label} {item.startTime}-{item.endTime}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteAvailability(item.id)}>Remover</Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horarios Fixos</CardTitle>
            <CardDescription>Base para alunos de plano fixo e reposicoes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select value={fixedSlotForm.athleteId} onChange={(e) => setFixedSlotForm((prev) => ({ ...prev, athleteId: e.target.value }))} className="h-10 w-full rounded-md border px-3 text-sm">
              <option value="">Selecione o aluno</option>
              {metadata.athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.user.profile.name}
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
              <option value="">Sem espaco definido</option>
              {spaces.filter((space) => space.isActive).map((space) => (
                <option key={space.id} value={space.id}>{space.name}</option>
              ))}
            </select>
            <Button onClick={handleCreateFixedSlot} disabled={!fixedSlotForm.athleteId || !fixedSlotForm.educatorId}>Cadastrar Horario Fixo</Button>

            <div className="space-y-2">
              {fixedSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum horario fixo cadastrado.</p>
              ) : (
                fixedSlots.map((slot) => (
                  <div key={slot.id} className="rounded-md border p-2 text-sm flex items-center justify-between">
                    <span>
                      <strong>{slot.athlete.user.profile.name}</strong> - {weekDays.find((day) => day.value === slot.dayOfWeek)?.label} {slot.startTime}-{slot.endTime} ({slot.isActive ? 'Ativo' : 'Inativo'})
                    </span>
                    {slot.isActive && (
                      <Button variant="outline" size="sm" onClick={() => handleDeactivateFixedSlot(slot.id)}>
                        Inativar
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
          <CardTitle>Agendamentos</CardTitle>
          <CardDescription>Controle dos horarios livres e reposicoes no periodo selecionado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento no periodo selecionado.</p>
          ) : (
            bookings.map((booking) => (
              <div key={booking.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <strong>{booking.athlete.user.profile.name}</strong> com {booking.educator.user.profile.name} em{' '}
                    {new Date(booking.bookingDate).toLocaleDateString('pt-BR')} - {booking.startTime}-{booking.endTime}
                    {booking.space ? ` - ${booking.space.name}` : ''}
                    <span className="ml-2 text-xs text-muted-foreground">
                      [{booking.bookingType === 'fixed_makeup' ? 'Reposicao' : 'Livre'}]
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{statusLabel[booking.status]}</span>
                    {booking.status === 'scheduled' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleUpdateBookingStatus(booking.id, 'completed')}>
                          Concluir
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleUpdateBookingStatus(booking.id, 'no_show')}>
                          Falta
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleUpdateBookingStatus(booking.id, 'canceled')}>
                          Cancelar
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

