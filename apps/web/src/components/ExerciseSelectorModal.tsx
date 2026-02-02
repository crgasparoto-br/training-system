import { useState, useEffect } from 'react';
import { X, Search, Play, Filter } from 'lucide-react';
import { Button } from './ui/Button';
import { libraryService, type Exercise } from '../services/library.service';

interface ExerciseSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  section: string;
}

const MUSCLE_GROUPS = [
  'Todos',
  'Abdômen',
  'Abdutores',
  'Adutores',
  'Bíceps',
  'Cardio',
  'Core',
  'Costas',
  'Full Body',
  'Glúteos',
  'Mobilidade',
  'Ombros',
  'Panturrilha',
  'Peitoral',
  'Posterior de Coxa',
  'Quadríceps',
  'Tríceps',
];

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'MOBILIDADE', label: 'Mobilidade' },
  { value: 'RESISTIDO', label: 'Resistido' },
  { value: 'CICLICO', label: 'Cíclico' },
];

export function ExerciseSelectorModal({ isOpen, onClose, onSelect, section }: ExerciseSelectorModalProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadExercises();
    }
  }, [isOpen, search, selectedCategory, selectedMuscleGroup]);

  const loadExercises = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      
      if (search) {
        filters.search = search;
      }
      
      if (selectedCategory) {
        filters.category = selectedCategory;
      }
      
      if (selectedMuscleGroup && selectedMuscleGroup !== 'Todos') {
        filters.muscleGroup = selectedMuscleGroup;
      }

      const data = await libraryService.list(filters);
      setExercises(data);
    } catch (error) {
      console.error('Erro ao carregar exercícios:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (exercise: Exercise) => {
    onSelect(exercise);
    onClose();
    // Limpar filtros
    setSearch('');
    setSelectedCategory('');
    setSelectedMuscleGroup('Todos');
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedMuscleGroup('Todos');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Selecionar Exercício</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Seção: <span className="font-medium">{section}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filtros */}
        <div className="p-6 border-b space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              type="text"
              placeholder="Buscar por nome ou grupo muscular..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          {/* Botão de Filtros */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} className="mr-2" />
              {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
            </Button>
            
            {(selectedCategory || selectedMuscleGroup !== 'Todos') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
              >
                Limpar Filtros
              </Button>
            )}
          </div>

          {/* Filtros Avançados */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium mb-2 block">Categoria</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Grupo Muscular</label>
                <select
                  value={selectedMuscleGroup}
                  onChange={(e) => setSelectedMuscleGroup(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {MUSCLE_GROUPS.map(group => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Lista de Exercícios */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : exercises.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum exercício encontrado</p>
              <Button onClick={handleClearFilters} className="mt-4" size="sm">
                Limpar Filtros
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exercises.map(exercise => (
                <button
                  key={exercise.id}
                  onClick={() => handleSelect(exercise)}
                  className="text-left p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{exercise.name}</h3>
                      
                      <div className="flex flex-wrap gap-2 text-xs">
                        {exercise.category && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                            {exercise.category}
                          </span>
                        )}
                        
                        {exercise.muscleGroup && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            {exercise.muscleGroup}
                          </span>
                        )}
                        
                        {exercise.loadType && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                            {exercise.loadType}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {exercise.videoUrl && (
                      <div className="flex-shrink-0">
                        <Play size={20} className="text-green-600" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {exercises.length} exercício{exercises.length !== 1 ? 's' : ''} encontrado{exercises.length !== 1 ? 's' : ''}
          </p>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
