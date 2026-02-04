import { useState, useEffect } from 'react';
import { X, Search, Video } from 'lucide-react';
import { libraryService, Exercise } from '../../services/library.service';

interface ExerciseSelectionModalProps {
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  category?: string;
}

export default function ExerciseSelectionModal({ onClose, onSelect, category = 'RESISTIDO' }: ExerciseSelectionModalProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadExercises();
  }, []);

  useEffect(() => {
    filterExercises();
  }, [searchTerm, selectedMuscleGroup, exercises]);

  // Fechar com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      const data = await libraryService.getExercises();
      // Filtrar apenas exercícios da categoria RESISTIDO
      const resistedExercises = data.filter(ex => ex.category === category);
      setExercises(resistedExercises);
      setFilteredExercises(resistedExercises);
    } catch (error) {
      console.error('Erro ao carregar exercícios:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterExercises = () => {
    let filtered = exercises;

    // Filtro por termo de busca
    if (searchTerm) {
      filtered = filtered.filter(ex =>
        ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ex.muscleGroup?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por grupo muscular
    if (selectedMuscleGroup) {
      filtered = filtered.filter(ex => ex.muscleGroup === selectedMuscleGroup);
    }

    setFilteredExercises(filtered);
  };

  const muscleGroups = Array.from(new Set(exercises.map(ex => ex.muscleGroup).filter(Boolean)));

  const handleToggleExercise = (exercise: Exercise) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(exercise.id)) {
        next.delete(exercise.id);
      } else {
        next.add(exercise.id);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    if (selectedIds.size === 0) return;
    const selectedExercises = exercises.filter((exercise) => selectedIds.has(exercise.id));
    selectedExercises.forEach((exercise) => onSelect(exercise));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Selecionar Exercício</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Fechar (ESC)"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-gray-200 space-y-3">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou grupo muscular..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Filtro por grupo muscular */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedMuscleGroup('')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedMuscleGroup === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos ({exercises.length})
            </button>
            {muscleGroups.sort().map((group) => (
              <button
                key={group}
                onClick={() => setSelectedMuscleGroup(group)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedMuscleGroup === group
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {group} ({exercises.filter(ex => ex.muscleGroup === group).length})
              </button>
            ))}
          </div>
        </div>

        {/* Lista de exercícios */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Carregando exercícios...</div>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <p className="text-lg font-medium">Nenhum exercício encontrado</p>
              <p className="text-sm mt-1">Tente ajustar os filtros de busca</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredExercises.map((exercise) => {
                const isSelected = selectedIds.has(exercise.id);
                return (
                  <button
                    key={exercise.id}
                    onClick={() => handleToggleExercise(exercise)}
                    className={`flex items-start gap-3 p-4 border rounded-lg transition-all text-left group ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={`mt-1 h-4 w-4 rounded border flex items-center justify-center ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <span className="h-2 w-2 rounded bg-white" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 truncate">
                        {exercise.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {exercise.muscleGroup && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            {exercise.muscleGroup}
                          </span>
                        )}
                        {exercise.loadType && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {exercise.loadType}
                          </span>
                        )}
                        {exercise.videoUrl && (
                          <Video className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <span>
              {filteredExercises.length} exercício{filteredExercises.length !== 1 ? 's' : ''} encontrado{filteredExercises.length !== 1 ? 's' : ''}
            </span>
            <span className="text-sm text-gray-700">
              {selectedIds.size} exercício{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <span className="text-xs">
              Pressione <kbd className="px-2 py-1 bg-gray-200 rounded">ESC</kbd> para fechar
            </span>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Adicionar selecionados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
