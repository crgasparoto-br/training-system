import { useState } from 'react';
import ResistanceDayTable from './ResistanceDayTable';

interface WorkoutBuilderResistanceProps {
  templateData: any;
  onChange: (data: any) => void;
}

export default function WorkoutBuilderResistance({ templateData, onChange }: WorkoutBuilderResistanceProps) {
  const days = [
    { dayOfWeek: 1, label: 'Segunda-Feira', date: '19/1' },
    { dayOfWeek: 2, label: 'Terça-Feira', date: '20/1' },
    { dayOfWeek: 3, label: 'Quarta-Feira', date: '21/1' },
    { dayOfWeek: 4, label: 'Quinta-Feira', date: '22/1' },
    { dayOfWeek: 5, label: 'Sexta-Feira', date: '23/1' },
    { dayOfWeek: 6, label: 'Sábado', date: '24/1' },
    { dayOfWeek: 7, label: 'Domingo', date: '25/1' }
  ];

  const [dayData, setDayData] = useState<any>({});

  const handleDayChange = (dayOfWeek: number, data: any) => {
    const newDayData = { ...dayData, [dayOfWeek]: data };
    setDayData(newDayData);
    onChange({ ...templateData, workoutDays: newDayData });
  };

  return (
    <div className="space-y-6">
      {/* Resumo Resistido da Semana */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Resumo Resistido da Semana
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meso
            </label>
            <input
              type="number"
              defaultValue={templateData?.mesocycleNumber || 8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Micro
            </label>
            <input
              type="number"
              defaultValue={templateData?.weekNumber || 30}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Frequência Resistido
            </label>
            <input
              type="number"
              defaultValue={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Semana
            </label>
            <input
              type="number"
              defaultValue={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              % Carga TR
            </label>
            <input
              type="number"
              step="0.1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sér. Gr. M.
            </label>
            <input
              type="number"
              defaultValue={30}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zona Rep.
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rep Reserva
            </label>
            <input
              type="number"
              defaultValue={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Micro Ciclo
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Divisão do Treino
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Freq. Semanal F
            </label>
            <input
              type="number"
              defaultValue={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Dias da Semana - Layout Tabular */}
      <div className="space-y-6">
        {days.map((day) => (
          <ResistanceDayTable
            key={day.dayOfWeek}
            dayOfWeek={day.dayOfWeek}
            label={day.label}
            date={day.date}
            data={dayData[day.dayOfWeek] || {}}
            onChange={(data) => handleDayChange(day.dayOfWeek, data)}
          />
        ))}
      </div>
    </div>
  );
}
