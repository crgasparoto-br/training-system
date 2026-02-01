import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Trash2, Eye } from 'lucide-react';
import { libraryService, Exercise, ExerciseFilters } from '../../services/library.service';
import ExerciseModal from './ExerciseModal';

const LOAD_TYPES = [
  { value: 'H', label: 'Halteres' },
  { value: 'C', label: 'Corporal' },
  { value: 'E', label: 'Elásticos' },
  { value: 'A', label: 'Aeróbicos' },
  { value: 'P', label: 'P.S.' },
  { value: 'O', label: 'Outros' },
];

const MOVEMENT_TYPES = [
  { value: 'U', label: 'Unilateral' },
  { value: 'I', label: 'Isolado' },
  { value: 'O', label: 'Outros (Bilateral)' },
];

const COUNTING_TYPES = [
  { value: 'I', label: 'Isometria' },
  { value: 'T', label: 'por Tempo' },
  { value: 'R', label: 'Repetições' },
];

const CATEGORIES = ['MOBILIDADE', 'RESISTIDO', 'CICLICO'];

export default function Library() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ExerciseFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');

  useEffect(() => {
    loadExercises();
  }, [filters]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      const data = await libraryService.listExercises(filters);
      setExercises(data);
    } catch (error) {
      console.error('Erro ao carregar exercícios:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedExercise(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const handleEdit = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleView = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setModalMode('view');
    setModalOpen(true);
  };

  const handleDelete = async (exercise: Exercise) => {
    if (!confirm(`Tem certeza que deseja excluir "${exercise.name}"?`)) {
      return;
    }

    try {
      await libraryService.deleteExercise(exercise.id);
      loadExercises();
    } catch (error) {
      console.error('Erro ao excluir exercício:', error);
      alert('Erro ao excluir exercício');
    }
  };

  const handleModalClose = (saved: boolean) => {
    setModalOpen(false);
    setSelectedExercise(null);
    if (saved) {
      loadExercises();
    }
  };

  const getLoadTypeLabel = (type?: string) => {
    return LOAD_TYPES.find((t) => t.value === type)?.label || '-';
  };

  const getMovementTypeLabel = (type?: string) => {
    return MOVEMENT_TYPES.find((t) => t.value === type)?.label || '-';
  };

  const getCountingTypeLabel = (type?: string) => {
    return COUNTING_TYPES.find((t) => t.value === type)?.label || '-';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Biblioteca de Exercícios</h1>
          <p className="text-gray-600 mt-2">Gerencie o catálogo de exercícios disponíveis</p>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou grupo muscular..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={filters.search || ''}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Filter className="w-5 h-5" />
                Filtros
              </button>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Novo Exercício
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={filters.category || ''}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
                >
                  <option value="">Todas</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Carga</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={filters.loadType || ''}
                  onChange={(e) => setFilters({ ...filters, loadType: e.target.value || undefined })}
                >
                  <option value="">Todos</option>
                  {LOAD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Movimento</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={filters.movementType || ''}
                  onChange={(e) => setFilters({ ...filters, movementType: e.target.value || undefined })}
                >
                  <option value="">Todos</option>
                  {MOVEMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contagem</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={filters.countingType || ''}
                  onChange={(e) => setFilters({ ...filters, countingType: e.target.value || undefined })}
                >
                  <option value="">Todos</option>
                  {COUNTING_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : exercises.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Nenhum exercício encontrado. Clique em "Novo Exercício" para adicionar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Exercício
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Grupo Muscular
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Carga
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Movimento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contagem
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {exercises.map((exercise) => (
                    <tr key={exercise.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{exercise.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {exercise.category || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {exercise.muscleGroup || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getLoadTypeLabel(exercise.loadType)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getMovementTypeLabel(exercise.movementType)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getCountingTypeLabel(exercise.countingType)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleView(exercise)}
                            className="text-gray-600 hover:text-gray-900"
                            title="Visualizar"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleEdit(exercise)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(exercise)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 text-sm text-gray-600">
          Total: {exercises.length} exercício{exercises.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ExerciseModal
          mode={modalMode}
          exercise={selectedExercise}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
