import { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';

interface ResistanceDayTableProps {
  dayOfWeek: number;
  label: string;
  date: string;
  data: any;
  onChange: (data: any) => void;
}

interface Exercise {
  id: string;
  exerciseName: string;
  system: string;
  sets: number | null;
  reps: number | null;
  interval: number | null;
  cParam: number | null;
  eParam: number | null;
  load: number | null;
  notes: string;
}

export default function ResistanceDayTable({ dayOfWeek, label, date, data, onChange }: ResistanceDayTableProps) {
  const [exercises, setExercises] = useState<{
    mobilidade: Exercise[];
    sessao: Exercise[];
    resfriamento: Exercise[];
  }>({
    mobilidade: [],
    sessao: [],
    resfriamento: []
  });

  const handleAddExercise = (section: 'mobilidade' | 'sessao' | 'resfriamento') => {
    // TODO: Abrir modal de seleção de exercícios
    alert(`Adicionar exercício na seção: ${section}`);
  };

  const handleEditExercise = (section: string, exerciseId: string) => {
    // TODO: Abrir modal de edição
    alert(`Editar exercício: ${exerciseId}`);
  };

  const handleDeleteExercise = (section: 'mobilidade' | 'sessao' | 'resfriamento', exerciseId: string) => {
    const newExercises = {
      ...exercises,
      [section]: exercises[section].filter(ex => ex.id !== exerciseId)
    };
    setExercises(newExercises);
  };

  const renderExerciseTable = (
    section: 'mobilidade' | 'sessao' | 'resfriamento',
    title: string,
    bgColor: string
  ) => {
    const sectionExercises = exercises[section];

    return (
      <div className="mb-4">
        <div className={`${bgColor} px-4 py-2 font-semibold text-sm text-gray-900`}>
          {title}
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">n</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 min-w-[200px]">Exercício</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Sistema</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">S</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Rep</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Int</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">C</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">E</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Crg</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Aj</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sectionExercises.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-500">
                    Nenhum exercício adicionado
                  </td>
                </tr>
              ) : (
                sectionExercises.map((exercise, index) => (
                  <tr key={exercise.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-3 py-2 text-sm text-gray-900">{exercise.exerciseName}</td>
                    <td className="px-3 py-2 text-sm text-gray-900">{exercise.system}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">{exercise.sets || '-'}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">{exercise.reps || '-'}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">{exercise.interval || '-'}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">{exercise.cParam || '-'}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">{exercise.eParam || '-'}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">{exercise.load || '-'}</td>
                    <td className="px-3 py-2 text-sm text-center text-gray-900">-</td>
                    <td className="px-3 py-2 text-sm text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditExercise(section, exercise.id)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExercise(section, exercise.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <button
            onClick={() => handleAddExercise(section)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Exercício
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header do Dia */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{date} - {label}</h3>
          </div>
        </div>

        {/* Configurações do Dia */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tempo sessão total (min)
            </label>
            <input
              type="number"
              defaultValue={62}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Cíclico (min)
            </label>
            <input
              type="number"
              defaultValue={15}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Resistido (min)
            </label>
            <input
              type="number"
              defaultValue={37}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              PSE da sessão
            </label>
            <input
              type="number"
              min="1"
              max="10"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Orientações Gerais */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Orientações Gerais
          </label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Digite as orientações gerais para este dia..."
          />
        </div>
      </div>

      {/* Tabelas de Exercícios */}
      <div className="p-6">
        {renderExerciseTable('mobilidade', 'MOBILIDADE | AQUECIMENTO | ATIVAÇÃO | TÉCNICO', 'bg-purple-100')}
        {renderExerciseTable('sessao', 'SESSÃO', 'bg-green-100')}
        {renderExerciseTable('resfriamento', 'RESFRIAMENTO | FINALIZAÇÃO', 'bg-blue-100')}

        {/* Observações */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observações
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Digite observações sobre este dia de treino..."
          />
        </div>
      </div>

      {/* Footer com Ações */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <button className="text-sm text-gray-600 hover:text-gray-900">
          Copiar para outro dia ▼
        </button>
        <button className="text-sm text-red-600 hover:text-red-700">
          Limpar dia
        </button>
      </div>
    </div>
  );
}
