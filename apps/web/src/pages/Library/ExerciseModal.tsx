import { useState, useEffect } from 'react';
import { X, Video } from 'lucide-react';
import { libraryService, Exercise, CreateExerciseDTO } from '../../services/library.service';
import YouTubeEmbed from './YouTubeEmbed';

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
  { value: 'I', label: 'Isolado' },
  { value: 'O', label: 'Outros (Bilateral)' },
];

const COUNTING_TYPES = [
  { value: 'I', label: 'Isometria' },
  { value: 'T', label: 'por Tempo (Repetições)' },
  { value: 'R', label: 'Repetições' },
];

const CATEGORIES = ['MOBILIDADE', 'RESISTIDO', 'CICLICO'];

interface ExerciseModalProps {
  mode: 'create' | 'edit' | 'view';
  exercise: Exercise | null;
  onClose: (saved: boolean) => void;
}

export default function ExerciseModal({ mode, exercise, onClose }: ExerciseModalProps) {
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

  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit';
  const isCreateMode = mode === 'create';

  useEffect(() => {
    if (exercise) {
      setFormData({
        name: exercise.name,
        videoUrl: exercise.videoUrl || '',
        loadType: exercise.loadType,
        movementType: exercise.movementType,
        countingType: exercise.countingType,
        category: exercise.category || '',
        muscleGroup: exercise.muscleGroup || '',
        notes: exercise.notes || '',
      });
    }
  }, [exercise]);

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

    try {
      setSaving(true);
      setError('');

      if (isEditMode && exercise) {
        await libraryService.updateExercise(exercise.id, formData);
      } else {
        await libraryService.createExercise(formData);
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
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Exercício *
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                Link Vídeo Youtube
              </div>
            </label>
            <input
              type="url"
              disabled={isViewMode}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="https://www.youtube.com/watch?v=..."
              value={formData.videoUrl}
              onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
            />
            
            {/* Preview do Vídeo */}
            {formData.videoUrl && (
              <div className="mt-4">
                <YouTubeEmbed url={formData.videoUrl} />
              </div>
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
