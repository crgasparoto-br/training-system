import { ResistedStimulus } from '../../services/periodization.service';
import { Plus } from 'lucide-react';

interface WorkoutBuilderResistanceProps {
  templateData: any;
  resistedSummary: ResistedStimulus | null;
  onChange: (data: any) => void;
}

export default function WorkoutBuilderResistance({ resistedSummary }: WorkoutBuilderResistanceProps) {
  const days = [
    { dayOfWeek: 1, label: 'Segunda-Feira', date: '19/1' },
    { dayOfWeek: 2, label: 'Terça-Feira', date: '20/1' },
    { dayOfWeek: 3, label: 'Quarta-Feira', date: '21/1' },
    { dayOfWeek: 4, label: 'Quinta-Feira', date: '22/1' },
    { dayOfWeek: 5, label: 'Sexta-Feira', date: '23/1' },
    { dayOfWeek: 6, label: 'Sábado', date: '24/1' },
    { dayOfWeek: 7, label: 'Domingo', date: '25/1' }
  ];

  const renderDayExerciseCell = (dayLabel: string, sectionTitle: string) => (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left font-medium text-gray-600">n</th>
              <th className="px-2 py-1 text-left font-medium text-gray-600 min-w-[140px]">Exercício</th>
              <th className="px-2 py-1 text-left font-medium text-gray-600">Sistema</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">S</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">Rep</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">Int</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">C</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">E</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">Crg</th>
              <th className="px-2 py-1 text-center font-medium text-gray-600">Aj</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={10} className="px-2 py-3 text-center text-gray-400">
                Nenhum exercício adicionado
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 px-2 py-2">
        <button
          type="button"
          onClick={() => alert(`Adicionar exercício em ${dayLabel} - ${sectionTitle}`)}
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Exercício
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Resumo Resistido da Semana */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-md border border-purple-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900">
              Resumo Resistido da Semana
            </h3>
          </div>
        </div>

        <div className="bg-white rounded-lg px-6 py-4 shadow-sm border border-gray-200 space-y-3">
          {/* Primeira linha */}
          <div className="grid grid-cols-4 gap-6">
            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                % Carga TR....................:
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={resistedSummary?.loadPercentage ?? ''}
                  readOnly
                  className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
                />
                <span className="text-gray-600 font-medium text-sm">%</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Séries Grandes Músculos:
              </label>
              <input
                type="number"
                value={resistedSummary?.seriesReference ?? ''}
                readOnly
                className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Zona de Repetições........:
              </label>
              <input
                type="text"
                value={resistedSummary?.repZone ?? ''}
                readOnly
                className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Repetições em Reserva:
              </label>
              <input
                type="number"
                value={resistedSummary?.repReserve ?? ''}
                readOnly
                className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>
          </div>

          {/* Segunda linha */}
          <div className="grid grid-cols-4 gap-6">
            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Método............................:
              </label>
              <input
                type="text"
                value={resistedSummary?.method ?? ''}
                readOnly
                className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Micro Ciclo.....................:
              </label>
              <input
                type="text"
                value={resistedSummary?.loadCycle ?? ''}
                readOnly
                className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Divisão do Treino............:
              </label>
              <input
                type="text"
                value={resistedSummary?.trainingDivision ?? ''}
                readOnly
                className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Frequência Semanal........:
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={resistedSummary?.weeklyFrequency ?? ''}
                  readOnly
                  className="w-16 px-2 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
                />
                <span className="text-gray-600 font-medium text-sm">x/sem</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela Semanal - Layout Colunar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Treinamento Resistido - Semana</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 min-w-[280px]">
                  Treinamentos
                </th>
                {days.map((day) => (
                  <th
                    key={day.dayOfWeek}
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-700 border-b border-gray-200 min-w-[160px]"
                  >
                    <div className="font-medium text-gray-900">{day.label}</div>
                    <div className="text-[11px] text-gray-500">{day.date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {[
                { key: 'mobilidade', title: 'MOBILIDADE | AQUECIMENTO | ATIVAÇÃO | TÉCNICO', bg: 'bg-purple-50' },
                { key: 'sessao', title: 'SESSÃO', bg: 'bg-green-50' },
                { key: 'resfriamento', title: 'RESFRIAMENTO | FINALIZAÇÃO', bg: 'bg-blue-50' }
              ].map((section) => (
                <tr key={section.key} className="border-b border-gray-200">
                  <td className={`px-4 py-3 text-xs font-semibold text-gray-800 ${section.bg}`}>
                    {section.title}
                  </td>
                  {days.map((day) => (
                    <td key={day.dayOfWeek} className="px-4 py-3 align-top">
                      {renderDayExerciseCell(day.label, section.title)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
