import { useState } from 'react';
import { ResistedStimulus } from '../../services/periodization.service';
import ResistanceDayTable from './ResistanceDayTable';

interface WorkoutBuilderResistanceProps {
  templateData: any;
  resistedSummary: ResistedStimulus | null;
  onChange: (data: any) => void;
}

export default function WorkoutBuilderResistance({ templateData, resistedSummary, onChange }: WorkoutBuilderResistanceProps) {
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
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              % Carga TR
              <input
                type="number"
                step="0.1"
                value={resistedSummary?.loadPercentage ?? ''}
                readOnly
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-right"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Sér. Gr. M.
              <input
                type="number"
                value={resistedSummary?.seriesReference ?? ''}
                readOnly
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-right"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Zona Rep.
              <input
                type="text"
                value={resistedSummary?.repZone ?? ''}
                readOnly
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Rep Reserva
              <input
                type="number"
                value={resistedSummary?.repReserve ?? ''}
                readOnly
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-right"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Método
              <input
                type="text"
                value={resistedSummary?.method ?? ''}
                readOnly
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Micro Ciclo
              <input
                type="text"
                value={resistedSummary?.loadCycle ?? ''}
                readOnly
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Divisão do Treino
              <input
                type="text"
                value={resistedSummary?.trainingDivision ?? ''}
                readOnly
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
              Freq. Semanal F
              <input
                type="number"
                value={resistedSummary?.weeklyFrequency ?? ''}
                readOnly
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-right"
              />
            </label>
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
