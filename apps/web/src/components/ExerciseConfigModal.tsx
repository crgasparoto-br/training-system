import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Button } from './ui/Button';
import type { Exercise } from '../services/library.service';

export interface ExerciseConfig {
  sets?: number;
  reps?: number;
  load?: number;
  intervalSec?: number;
  system?: string;
  exerciseNotes?: string;
}

interface ExerciseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ExerciseConfig) => void;
  exercise: Exercise | null;
  initialConfig?: ExerciseConfig;
}

const SYSTEMS = [
  { value: '', label: 'Nenhum' },
  { value: 'BI-SET', label: 'Bi-Set' },
  { value: 'TRI-SET', label: 'Tri-Set' },
  { value: 'CIRCUITO', label: 'Circuito' },
  { value: 'DROP-SET', label: 'Drop Set' },
  { value: 'SUPER-SET', label: 'Super Set' },
];

export function ExerciseConfigModal({
  isOpen,
  onClose,
  onSave,
  exercise,
  initialConfig,
}: ExerciseConfigModalProps) {
  const [sets, setSets] = useState<string>('');
  const [reps, setReps] = useState<string>('');
  const [load, setLoad] = useState<string>('');
  const [intervalSec, setIntervalSec] = useState<string>('');
  const [system, setSystem] = useState<string>('');
  const [exerciseNotes, setExerciseNotes] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && initialConfig) {
      setSets(initialConfig.sets?.toString() || '');
      setReps(initialConfig.reps?.toString() || '');
      setLoad(initialConfig.load?.toString() || '');
      setIntervalSec(initialConfig.intervalSec?.toString() || '');
      setSystem(initialConfig.system || '');
      setExerciseNotes(initialConfig.exerciseNotes || '');
    } else if (isOpen) {
      // Valores padrão
      setSets('3');
      setReps('12');
      setLoad('');
      setIntervalSec('60');
      setSystem('');
      setExerciseNotes('');
    }
  }, [isOpen, initialConfig]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (sets && (parseInt(sets) < 1 || parseInt(sets) > 10)) {
      newErrors.sets = 'Séries devem estar entre 1 e 10';
    }

    if (reps && (parseInt(reps) < 1 || parseInt(reps) > 100)) {
      newErrors.reps = 'Repetições devem estar entre 1 e 100';
    }

    if (load && parseFloat(load) < 0) {
      newErrors.load = 'Carga não pode ser negativa';
    }

    if (intervalSec && (parseInt(intervalSec) < 0 || parseInt(intervalSec) > 600)) {
      newErrors.intervalSec = 'Intervalo deve estar entre 0 e 600 segundos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      return;
    }

    const config: ExerciseConfig = {
      sets: sets ? parseInt(sets) : undefined,
      reps: reps ? parseInt(reps) : undefined,
      load: load ? parseFloat(load) : undefined,
      intervalSec: intervalSec ? parseInt(intervalSec) : undefined,
      system: system || undefined,
      exerciseNotes: exerciseNotes || undefined,
    };

    onSave(config);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (!isOpen || !exercise) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Configurar Exercício</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {exercise.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6" onKeyDown={handleKeyDown}>
            {/* Séries e Repetições */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Séries *
                </label>
                <input
                  type="number"
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    errors.sets ? 'border-red-500' : ''
                  }`}
                  placeholder="3"
                  min="1"
                  max="10"
                />
                {errors.sets && (
                  <p className="text-xs text-red-500 mt-1">{errors.sets}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Repetições *
                </label>
                <input
                  type="number"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    errors.reps ? 'border-red-500' : ''
                  }`}
                  placeholder="12"
                  min="1"
                  max="100"
                />
                {errors.reps && (
                  <p className="text-xs text-red-500 mt-1">{errors.reps}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Para tempo, use segundos (ex: 30)
                </p>
              </div>
            </div>

            {/* Carga e Intervalo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Carga (kg)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={load}
                  onChange={(e) => setLoad(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    errors.load ? 'border-red-500' : ''
                  }`}
                  placeholder="60"
                  min="0"
                />
                {errors.load && (
                  <p className="text-xs text-red-500 mt-1">{errors.load}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe vazio para carga corporal
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Intervalo (segundos)
                </label>
                <input
                  type="number"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    errors.intervalSec ? 'border-red-500' : ''
                  }`}
                  placeholder="60"
                  min="0"
                  max="600"
                />
                {errors.intervalSec && (
                  <p className="text-xs text-red-500 mt-1">{errors.intervalSec}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Intervalo entre séries
                </p>
              </div>
            </div>

            {/* Sistema de Treino */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Sistema de Treino
              </label>
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {SYSTEMS.map(sys => (
                  <option key={sys.value} value={sys.value}>
                    {sys.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Método de execução (Bi-Set, Tri-Set, etc.)
              </p>
            </div>

            {/* Observações */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Observações
              </label>
              <textarea
                value={exerciseNotes}
                onChange={(e) => setExerciseNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Observações específicas para este exercício..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Instruções adicionais ou variações
              </p>
            </div>

            {/* Resumo */}
            <div className="p-4 bg-secondary/50 rounded-lg">
              <h3 className="font-semibold mb-2">Resumo</h3>
              <p className="text-sm">
                {sets || '?'} séries × {reps || '?'} reps
                {load && ` | ${load}kg`}
                {intervalSec && ` | ${intervalSec}s de intervalo`}
                {system && ` | ${SYSTEMS.find(s => s.value === system)?.label}`}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Pressione Ctrl+Enter para salvar rapidamente
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              <Save size={16} className="mr-2" />
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
