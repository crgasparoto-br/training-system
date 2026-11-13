import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Archive, Eye, X, Check, Send, RotateCcw, Copy, Video as VideoIcon, BookOpen } from 'lucide-react';
import { libraryService, type Exercise, type ExerciseFilters, type ExerciseCurationAction } from '../../services/library.service';
import { useAuthStore } from '../../stores/useAuthStore';
import ExerciseModal from './ExerciseModal';
import LibraryStats from './LibraryStats';

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
  { value: 'A', label: 'Alternado' },
  { value: 'I', label: 'Isolado' },
  { value: 'O', label: 'Outros (Bilateral)' },
];

const COUNTING_TYPES = [
  { value: 'I', label: 'Isometria' },
  { value: 'T', label: 'por Tempo' },
  { value: 'R', label: 'Repetições' },
];

const CATEGORIES = ['MOBILIDADE', 'RESISTIDO', 'CICLICO', 'FLEXIBILIDADE', 'EQUILIBRIO'];

const MUSCLE_GROUPS = [
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

const STATUS_LABELS = { draft: 'Rascunho', in_review: 'Em revisão', approved: 'Aprovado', inactive: 'Desativado' } as const;

export default function Library() {
  const { user } = useAuthStore();
  const canManage = user?.type === 'professor' && user.professor?.role === 'master';
  const [loadError, setLoadError] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ExerciseFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');

  useEffect(() => {
    loadExercises();
  }, [filters, canManage]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      const data = await libraryService.listExercises({ ...filters, scope: canManage ? 'all' : 'official' });
      setExercises(data);
      setLoadError('');
    } catch (error) {
      console.error('Erro ao carregar exercícios:', error);
      setLoadError('Não foi possível carregar a biblioteca. Tente novamente.');
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

  const handleCloneForCuration = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setModalMode('create');
    setModalOpen(true);
  };

  const handleView = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setModalMode('view');
    setModalOpen(true);
  };

  const handleDelete = async (exercise: Exercise) => {
    if (!canManage || !confirm(`Desativar "${exercise.name}"? Os treinos antigos continuarão disponíveis.`)) {
      return;
    }

    try {
      await libraryService.deleteExercise(exercise.id, exercise.version);
      loadExercises();
    } catch (error) {
      console.error('Erro ao excluir exercício:', error);
      alert('Não foi possível desativar. Recarregue a biblioteca e tente novamente.');
    }
  };

  const handleCuration = async (exercise: Exercise, action: ExerciseCurationAction) => {
    if (!canManage) return;
    if (!confirm(`Confirma a ação "${action}" no exercício "${exercise.name}"?`)) return;
    try {
      await libraryService.reviewExercise(exercise.id, action, exercise.version);
      await loadExercises();
    } catch (error) {
      console.error('Erro na curadoria:', error);
      alert('Não foi possível concluir a revisão. Verifique os dados ou recarregue a biblioteca.');
    }
  };

  const handleModalClose = (saved: boolean) => {
    setModalOpen(false);
    setSelectedExercise(null);
    if (saved) {
      loadExercises();
    }
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = () => {
    return Object.keys(filters).some(key => filters[key as keyof ExerciseFilters]);
  };

  const activeFiltersCount = () => {
    return Object.keys(filters).filter(key => filters[key as keyof ExerciseFilters]).length;
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
          <p className="text-gray-600 mt-2">{canManage ? 'Cadastre, revise e aprove exercícios antes de disponibilizá-los.' : 'Consulte exercícios aprovados para aplicação nos treinos.'}</p>
        </div>

        {/* Statistics */}
        {!loading && exercises.length > 0 && (
          <div className="mb-6">
            <LibraryStats exercises={exercises} />
          </div>
        )}

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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors relative"
              >
                <Filter className="w-5 h-5" />
                Filtros
                {activeFiltersCount() > 0 && (
                  <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFiltersCount()}
                  </span>
                )}
              </button>
              {hasActiveFilters() && (
                <button
                  onClick={handleClearFilters}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                  title="Limpar todos os filtros"
                >
                  <X className="w-5 h-5" />
                  Limpar
                </button>
              )}
              {canManage && <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Novo Exercício
              </button>}
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Grupo Muscular</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={filters.muscleGroup || ''}
                  onChange={(e) => setFilters({ ...filters, muscleGroup: e.target.value || undefined })}
                >
                  <option value="">Todos</option>
                  {MUSCLE_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              {canManage && <div>
                <label htmlFor="exercise-status" className="block text-sm font-medium text-gray-700 mb-1">Situação</label>
                <select id="exercise-status" className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={filters.curationStatus || ''}
                  onChange={e => setFilters({ ...filters, curationStatus: (e.target.value || undefined) as ExerciseFilters['curationStatus'] })}>
                  <option value="">Todas</option>
                  {Object.entries(STATUS_LABELS).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                </select>
              </div>}
              <div>
                <label htmlFor="exercise-equipment" className="block text-sm font-medium text-gray-700 mb-1">Equipamento</label>
                <input id="exercise-equipment" className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Halteres"
                  value={filters.equipment || ''} onChange={e => setFilters({ ...filters, equipment: e.target.value || undefined })} />
              </div>
              <div>
                <label htmlFor="exercise-difficulty" className="block text-sm font-medium text-gray-700 mb-1">Dificuldade</label>
                <input id="exercise-difficulty" className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Iniciante"
                  value={filters.difficulty || ''} onChange={e => setFilters({ ...filters, difficulty: e.target.value || undefined })} />
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

        {loadError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {loadError} <button className="ml-2 underline" onClick={loadExercises}>Tentar novamente</button>
        </div>}
        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                <div className="h-4 bg-gray-200 rounded w-4/5"></div>
              </div>
            </div>
          ) : exercises.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <BookOpen className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {hasActiveFilters() ? 'Nenhum exercício encontrado' : 'Biblioteca vazia'}
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters()
                  ? 'Tente ajustar os filtros para encontrar exercícios.'
                  : 'Comece adicionando exercícios à sua biblioteca.'}
              </p>
              {!hasActiveFilters() && canManage && (
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Adicionar Primeiro Exercício
                </button>
              )}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Situação</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {exercises.map((exercise) => (
                    <tr key={exercise.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900">{exercise.name}</div>
                          {exercise.videoUrl && (
                            <VideoIcon className="w-4 h-4 text-green-600" title="Com vídeo" />
                          )}
                        </div>
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          exercise.curationStatus === 'approved' ? 'bg-green-100 text-green-800'
                            : exercise.curationStatus === 'in_review' ? 'bg-blue-100 text-blue-800'
                              : exercise.curationStatus === 'inactive' ? 'bg-gray-200 text-gray-700'
                                : 'bg-amber-100 text-amber-800'
                        }`}>{STATUS_LABELS[exercise.curationStatus] ?? 'Não informado'}</span>
                        <p className="text-xs text-gray-500">Versão {exercise.version}</p>
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
                          {canManage && <button
                            onClick={() => handleEdit(exercise)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <Edit className="w-5 h-5" />
                          </button>}
                          {canManage && exercise.legacyGrandfathered && <button
                            onClick={() => handleCloneForCuration(exercise)}
                            title="Criar nova versão para curadoria sem alterar o histórico"
                            aria-label={`Criar nova versão para curadoria de ${exercise.name}`}
                            className="text-indigo-700 hover:text-indigo-900"
                          >
                            <Copy className="w-5 h-5" />
                          </button>}
                          {canManage && exercise.curationStatus === 'draft' && <button
                            onClick={() => handleCuration(exercise, 'submit')} title="Enviar para revisão"
                            className="text-blue-700" aria-label={`Revisar ${exercise.name}`}><Send className="w-5 h-5" /></button>}
                          {canManage && exercise.curationStatus === 'in_review' && <>
                            <button onClick={() => handleCuration(exercise, 'approve')} title="Aprovar"
                              className="text-green-700" aria-label={`Aprovar ${exercise.name}`}><Check className="w-5 h-5" /></button>
                            <button onClick={() => handleCuration(exercise, 'request_changes')} title="Solicitar ajustes"
                              className="text-amber-700" aria-label={`Solicitar ajustes em ${exercise.name}`}><RotateCcw className="w-5 h-5" /></button>
                          </>}
                          {canManage && exercise.curationStatus === 'inactive' && <button
                            onClick={() => handleCuration(exercise, 'reopen')} title="Reabrir como rascunho"
                            className="text-blue-700" aria-label={`Reabrir ${exercise.name}`}><RotateCcw className="w-5 h-5" /></button>}
                          {canManage && exercise.curationStatus !== 'inactive' && <button
                            onClick={() => handleDelete(exercise)}
                            className="text-red-600 hover:text-red-900"
                            title="Desativar (preserva histórico)"
                            aria-label={`Desativar ${exercise.name}`}
                          >
                            <Archive className="w-5 h-5" />
                          </button>}
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
          showHistory={Boolean(canManage)}
        />
      )}
    </div>
  );
}
