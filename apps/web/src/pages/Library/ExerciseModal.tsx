import { useState, useEffect } from 'react';
import { X, Video } from 'lucide-react';
import { libraryService, type Exercise, type CreateExerciseDTO, type ExerciseRevision } from '../../services/library.service';
import YouTubeEmbed from './YouTubeEmbed';
import { PHYSICAL_CAPACITY_TYPES, type PhysicalCapacityType } from '@corrida/types';

const LOAD_TYPES = [
  { value: 'H', label: 'Halteres' },
  { value: 'C', label: 'Corporal' },
  { value: 'E', label: 'Elásticos' },
  { value: 'A', label: 'Aeróbicos' },
  { value: 'P', label: 'P.S. (observações)' },
  { value: 'O', label: 'Outros (máquinas e barras)' },
];

const MOVEMENT_TYPES = [
  { value: 'U', label: 'Unilateral' },
  { value: 'A', label: 'Alternado' },
  { value: 'I', label: 'Isolado' },
  { value: 'O', label: 'Outros (Bilateral)' },
];

const COUNTING_TYPES = [
  { value: 'I', label: 'Isometria' },
  { value: 'T', label: 'por Tempo (Repetições)' },
  { value: 'R', label: 'Repetições' },
];

const CATEGORIES = ['MOBILIDADE', 'RESISTIDO', 'CICLICO', 'FLEXIBILIDADE', 'EQUILIBRIO'];

const LIST_FIELDS = [
  { key: 'aliases', label: 'Outros nomes e aliases' },
  { key: 'equipment', label: 'Equipamentos' },
  { key: 'primaryMuscleGroups', label: 'Grupos musculares principais' },
  { key: 'secondaryMuscleGroups', label: 'Grupos musculares secundários' },
  { key: 'joints', label: 'Articulações envolvidas' },
  { key: 'instructions', label: 'Instruções em etapas' },
  { key: 'commonErrors', label: 'Erros comuns' },
  { key: 'regressions', label: 'Regressões' },
  { key: 'progressions', label: 'Progressões' },
  { key: 'alternatives', label: 'Alternativas sugeridas (apenas orientação)' },
  { key: 'restrictions', label: 'Restrições' },
  { key: 'alerts', label: 'Alertas' },
] as const;
type ListFieldKey = typeof LIST_FIELDS[number]['key'];

const TEXT_FIELDS = [
  { key: 'movementPattern', label: 'Padrão de movimento' },
  { key: 'laterality', label: 'Lateralidade' },
  { key: 'difficulty', label: 'Nível de dificuldade' },
  { key: 'mediaOrigin', label: 'Origem da mídia (própria ou licenciada)' },
  { key: 'mediaLicense', label: 'Licença ou autorização de uso da mídia' },
  { key: 'mediaAuthor', label: 'Autor da mídia' },
] as const;

interface ExerciseModalProps {
  mode: 'create' | 'edit' | 'view';
  exercise: Exercise | null;
  onClose: (saved: boolean) => void;
  showHistory?: boolean;
}

export default function ExerciseModal({ mode, exercise, onClose, showHistory = false }: ExerciseModalProps) {
  const [formData, setFormData] = useState<CreateExerciseDTO>({
    name: '',
    videoUrl: '',
    loadType: undefined,
    movementType: undefined,
    countingType: undefined,
    category: '',
    muscleGroup: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revisions, setRevisions] = useState<ExerciseRevision[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [listDrafts, setListDrafts] = useState<Partial<Record<ListFieldKey, string>>>({});
  const isCloneForCuration = mode === 'create' && exercise !== null;

  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit';

  useEffect(() => {
    // Never trim controlled textarea values while the user is typing.
    setListDrafts(Object.fromEntries(
      LIST_FIELDS.map(({ key }) => [key, (exercise?.[key] ?? []).join('\n')]),
    ) as Record<ListFieldKey, string>);
    if (exercise) {
      setFormData({
        name: isCloneForCuration ? `${exercise.name} (nova versão)` : exercise.name,
        videoUrl: isCloneForCuration ? '' : exercise.videoUrl || '',
        loadType: exercise.loadType,
        movementType: exercise.movementType,
        countingType: exercise.countingType,
        category: exercise.category || '',
        muscleGroup: exercise.muscleGroup || '',
        notes: exercise.notes || '',
        aliases: exercise.aliases,
        capacity: PHYSICAL_CAPACITY_TYPES.find((type) => type === exercise.capacity),
        equipment: exercise.equipment,
        primaryMuscleGroups: exercise.primaryMuscleGroups,
        secondaryMuscleGroups: exercise.secondaryMuscleGroups,
        movementPattern: exercise.movementPattern || '',
        joints: exercise.joints,
        laterality: exercise.laterality || '',
        difficulty: exercise.difficulty || '',
        instructions: exercise.instructions,
        commonErrors: exercise.commonErrors,
        regressions: exercise.regressions,
        progressions: exercise.progressions,
        alternatives: exercise.alternatives,
        restrictions: exercise.restrictions,
        alerts: exercise.alerts,
        mediaOrigin: isCloneForCuration ? '' : exercise.mediaOrigin || '',
        mediaLicense: isCloneForCuration ? '' : exercise.mediaLicense || '',
        mediaAuthor: isCloneForCuration ? '' : exercise.mediaAuthor || '',
      });
    }
  }, [exercise, mode]);

  useEffect(() => {
    if (!exercise || !showHistory || mode === 'create') return;
    setRevisions([]);
    setHistoryError('');
    libraryService.listExerciseRevisions(exercise.id)
      .then(setRevisions)
      .catch(() => setHistoryError('Não foi possível consultar o histórico.'));
  }, [exercise?.id, showHistory, mode]);

  const onListChange = (key: ListFieldKey, text: string) => {
    setListDrafts(previous => ({ ...previous, [key]: text }));
  };

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC para fechar
      if (e.key === 'Escape') {
        onClose(false);
      }
      // Ctrl+S ou Cmd+S para salvar (apenas em modo edit/create)
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !isViewMode) {
        e.preventDefault();
        const form = document.querySelector('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isViewMode, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Nome do exercício é obrigatório');
      return;
    }

    // Normalize once at the persistence boundary, not on every keypress.
    const normalizedLists = Object.fromEntries(LIST_FIELDS.map(({ key }) => [
      key, (listDrafts[key] ?? '').split(/\r?\n/).map(item => item.trim()).filter(Boolean),
    ])) as Pick<CreateExerciseDTO, ListFieldKey>;
    const submittedData = { ...formData, ...normalizedLists };

    try {
      setSaving(true);
      setError('');

      if (isEditMode && exercise) {
        await libraryService.updateExercise(exercise.id, submittedData, exercise.version);
      } else {
        await libraryService.createExercise(submittedData);
      }

      onClose(true);
    } catch (err: any) {
      console.error('Erro ao salvar exercício:', err);
      setError(err.response?.data?.message || 'Erro ao salvar exercício');
    } finally {
      setSaving(false);
    }
  };

  const getTitle = () => {
    if (isViewMode) return 'Visualizar Exercício';
    if (isEditMode) return 'Editar Exercício';
    if (isCloneForCuration) return 'Nova versão para curadoria';
    return 'Novo Exercício';
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose(false);
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{getTitle()}</h2>
            {!isViewMode && (
              <p className="text-xs text-gray-500 mt-1">ESC para fechar • Ctrl+S para salvar</p>
            )}
          </div>
          <button
            onClick={() => onClose(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {isCloneForCuration && <p className="text-sm text-amber-800">
            Será criada uma ficha em rascunho, com outro identificador. O exercício original e seus treinos permanecem intactos. Direitos de mídia precisam ser informados novamente.
          </p>}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Nome */}
          <div>
            <label htmlFor="library-exercise-name" className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Exercício *
            </label>
            <input
              id="library-exercise-name"
              type="text"
              required
              disabled={isViewMode}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Link Vídeo */}
          <div>
            <label htmlFor="library-exercise-video" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                Link Vídeo Youtube
              </div>
            </label>
            <input
              id="library-exercise-video"
              type="url"
              disabled={isViewMode}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="https://www.youtube.com/watch?v=..."
              value={formData.videoUrl}
              onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
            />
            
            {/* Preview do Vídeo */}
            {formData.videoUrl && !exercise?.legacyGrandfathered &&
              Boolean(formData.mediaOrigin?.trim() && formData.mediaLicense?.trim()) && (
              <div className="mt-4">
                <YouTubeEmbed url={formData.videoUrl} />
              </div>
            )}
            
            {formData.videoUrl && exercise?.legacyGrandfathered && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                Mídia legada preservada para o histórico. A prévia será habilitada após curadoria com origem e licença verificadas.
              </p>
            )}
            {!formData.videoUrl && (
              <p className="mt-2 text-sm text-gray-500">
                Adicione um link do YouTube para visualizar o vídeo de demonstração
              </p>
            )}
          </div>

          {/* Grid 2 colunas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Categoria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoria
              </label>
              <select
                disabled={isViewMode}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="">Selecione...</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Grupo Muscular */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Grupo Muscular
              </label>
              <input
                type="text"
                disabled={isViewMode}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="Ex: Quadríceps, Abdominal..."
                value={formData.muscleGroup}
                onChange={(e) => setFormData({ ...formData, muscleGroup: e.target.value })}
              />
            </div>

            {/* Tipo de Carga */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Carga
              </label>
              <select
                disabled={isViewMode}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                value={formData.loadType || ''}
                onChange={(e) => setFormData({ ...formData, loadType: e.target.value as any })}
              >
                <option value="">Selecione...</option>
                {LOAD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Movimento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Movimento
              </label>
              <select
                disabled={isViewMode}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                value={formData.movementType || ''}
                onChange={(e) => setFormData({ ...formData, movementType: e.target.value as any })}
              >
                <option value="">Selecione...</option>
                {MOVEMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Contagem */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Contagem
              </label>
              <select
                disabled={isViewMode}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                value={formData.countingType || ''}
                onChange={(e) => setFormData({ ...formData, countingType: e.target.value as any })}
              >
                <option value="">Selecione...</option>
                {COUNTING_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observações
            </label>
            <textarea
              rows={4}
              disabled={isViewMode}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="Notas adicionais sobre o exercício..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <section className="rounded-lg border border-gray-200 p-4 space-y-4" aria-label="Detalhes técnicos e orientações">
            <div>
              <h3 className="font-semibold text-gray-900">Classificação e orientação</h3>
              <p className="text-sm text-gray-500">Campos estruturados para pesquisa e avaliação profissional.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm font-medium text-gray-700">
                Capacidade física
                <select disabled={isViewMode} value={formData.capacity ?? ''}
                  onChange={e => setFormData(previous => ({ ...previous, capacity: e.target.value
                    ? e.target.value as PhysicalCapacityType : undefined }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100">
                  <option value="">Selecione uma capacidade...</option>
                  {PHYSICAL_CAPACITY_TYPES.map((type) => <option key={type} value={type}>{({
                    resisted: 'Resistido', flexibility: 'Flexibilidade',
                    cyclic: 'Cíclico', balance: 'Equilíbrio',
                  } satisfies Record<PhysicalCapacityType, string>)[type]}</option>)}
                </select>
                {exercise?.capacity && !PHYSICAL_CAPACITY_TYPES.some(value => value === exercise.capacity) && (
                  <span role="status" className="block mt-1 text-amber-800 text-xs">
                    Classificação legada: {exercise.capacity}. Selecione uma capacidade oficial antes da aprovação.
                  </span>
                )}
              </label>
              {TEXT_FIELDS.map(({ key, label }) => (
                <label key={key} className="block text-sm font-medium text-gray-700">
                  {label}
                  <input type="text" disabled={isViewMode} value={formData[key] || ''}
                    onChange={e => setFormData(previous => ({ ...previous, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {LIST_FIELDS.map(({ key, label }) => (
                <label key={key} className="block text-sm font-medium text-gray-700">
                  {label} <span className="text-xs text-gray-500">(um item por linha)</span>
                  <textarea rows={3} disabled={isViewMode}
                    value={listDrafts[key] ?? ''}
                    onChange={e => onListChange(key, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
                </label>
              ))}
            </div>
          </section>

          {exercise && mode !== 'create' && <section className="rounded-lg border border-gray-200 p-4" aria-label="Estado da curadoria">
            <h3 className="font-semibold">Curadoria e versão</h3>
            <p className="text-sm text-gray-600">Situação: {exercise.curationStatus} · Versão: {exercise.version}</p>
            <p className="text-xs text-gray-500">Autor: {exercise.createdByUserId || 'Legado'} ·
              Revisor: {exercise.reviewedByUserId || 'Não registrado'} ·
              Revisão: {exercise.reviewedAt ? new Date(exercise.reviewedAt).toLocaleString('pt-BR') : 'Pendente'}
            </p>
            {historyError && <p role="alert" className="mt-2 text-sm text-red-700">{historyError}</p>}
            {showHistory && <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">Ver histórico de versões</summary>
              {revisions.length === 0
                ? <p className="mt-2 text-sm text-gray-500">Nenhuma revisão encontrada.</p>
                : <ol className="mt-2 space-y-2 text-sm">
                  {revisions.map(revision => <li key={revision.id} className="border-b py-2">
                    Versão {revision.version} · {revision.action} · {new Date(revision.createdAt).toLocaleString('pt-BR')}
                    <div className="text-xs text-gray-600">Responsável: {revision.actorUserId || 'Importação legada'}</div>
                  </li>)}
                </ol>}
            </details>}
          </section>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {isViewMode ? 'Fechar' : 'Cancelar'}
            </button>
            {!isViewMode && (
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
