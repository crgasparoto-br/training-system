import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { X } from 'lucide-react';
import type { SessionType } from '../services/plan.service';

const sessionSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  sessionType: z.enum(['easy_run', 'tempo_run', 'interval', 'long_run', 'recovery', 'strength', 'rest']),
  durationMinutes: z.number().int().positive(),
  distanceKm: z.number().positive().optional(),
  intensityPercentage: z.number().min(0).max(100),
  paceMinPerKm: z.number().positive().optional(),
  heartRateZone: z.number().int().min(1).max(5).optional(),
  instructions: z.string().optional(),
  notes: z.string().optional(),
});

type SessionFormData = z.infer<typeof sessionSchema>;

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SessionFormData) => Promise<void>;
  initialData?: Partial<SessionFormData>;
  isEditMode?: boolean;
}

const sessionTypes: { value: SessionType; label: string }[] = [
  { value: 'easy_run', label: 'Corrida Leve' },
  { value: 'tempo_run', label: 'Corrida Tempo' },
  { value: 'interval', label: 'Intervalado' },
  { value: 'long_run', label: 'Corrida Longa' },
  { value: 'recovery', label: 'Recuperação' },
  { value: 'strength', label: 'Fortalecimento' },
  { value: 'rest', label: 'Descanso' },
];

const daysOfWeek = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

export function SessionModal({ isOpen, onClose, onSubmit, initialData, isEditMode = false }: SessionModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SessionFormData>({
    resolver: zodResolver(sessionSchema),
    defaultValues: initialData || {
      dayOfWeek: 1,
      sessionType: 'easy_run',
      durationMinutes: 60,
      intensityPercentage: 70,
    },
  });

  useEffect(() => {
    if (initialData) {
      reset(initialData);
    }
  }, [initialData, reset]);

  const handleFormSubmit = async (data: SessionFormData) => {
    await onSubmit(data);
    reset();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold">
            {isEditMode ? 'Editar Sessão' : 'Adicionar Sessão'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6">
          {/* Dia da Semana e Tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Dia da Semana *</label>
              <select
                className="w-full p-2 border rounded-md"
                {...register('dayOfWeek', { valueAsNumber: true })}
              >
                {daysOfWeek.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              {errors.dayOfWeek && (
                <p className="text-sm text-red-500">{errors.dayOfWeek.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Treino *</label>
              <select
                className="w-full p-2 border rounded-md"
                {...register('sessionType')}
              >
                {sessionTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {errors.sessionType && (
                <p className="text-sm text-red-500">{errors.sessionType.message}</p>
              )}
            </div>
          </div>

          {/* Duração e Distância */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Duração (minutos)"
              type="number"
              placeholder="60"
              error={errors.durationMinutes?.message}
              {...register('durationMinutes', { valueAsNumber: true })}
            />

            <Input
              label="Distância (km)"
              type="number"
              step="0.1"
              placeholder="10.0"
              error={errors.distanceKm?.message}
              {...register('distanceKm', { valueAsNumber: true })}
            />
          </div>

          {/* Intensidade e Pace */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Intensidade (%)"
              type="number"
              placeholder="70"
              error={errors.intensityPercentage?.message}
              {...register('intensityPercentage', { valueAsNumber: true })}
            />

            <Input
              label="Pace (min/km)"
              type="number"
              step="0.01"
              placeholder="5.30"
              error={errors.paceMinPerKm?.message}
              {...register('paceMinPerKm', { valueAsNumber: true })}
            />
          </div>

          {/* Zona de FC */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Zona de Frequência Cardíaca</label>
            <select
              className="w-full p-2 border rounded-md"
              {...register('heartRateZone', { valueAsNumber: true })}
            >
              <option value="">Selecione uma zona</option>
              <option value="1">Zona 1 - Recuperação (50-60%)</option>
              <option value="2">Zona 2 - Aeróbico Leve (60-70%)</option>
              <option value="3">Zona 3 - Aeróbico Moderado (70-80%)</option>
              <option value="4">Zona 4 - Limiar (80-90%)</option>
              <option value="5">Zona 5 - VO2 Max (90-100%)</option>
            </select>
            {errors.heartRateZone && (
              <p className="text-sm text-red-500">{errors.heartRateZone.message}</p>
            )}
          </div>

          {/* Instruções */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Instruções</label>
            <textarea
              className="w-full p-2 border rounded-md min-h-[100px]"
              placeholder="Descreva como executar este treino..."
              {...register('instructions')}
            />
            {errors.instructions && (
              <p className="text-sm text-red-500">{errors.instructions.message}</p>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notas</label>
            <textarea
              className="w-full p-2 border rounded-md min-h-[80px]"
              placeholder="Observações adicionais..."
              {...register('notes')}
            />
            {errors.notes && (
              <p className="text-sm text-red-500">{errors.notes.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">
              {isEditMode ? 'Atualizar' : 'Adicionar'} Sessão
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
