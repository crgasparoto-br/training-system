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

        <div className="bg-white rounded-lg px-6 py-4 shadow-sm border border-gray-200 space-y-4">
          {/* Primeira linha */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 w-60">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                % Carga TR:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={resistedSummary?.loadPercentage ?? ''}
                  readOnly
                  className="w-20 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
                />
                <span className="text-gray-600 font-medium">%</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-1">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Séries Grandes Músculos:
              </label>
              <input
                type="number"
                value={resistedSummary?.seriesReference ?? ''}
                readOnly
                className="w-20 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-3 flex-1">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Zona de Repetições:
              </label>
              <input
                type="text"
                value={resistedSummary?.repZone ?? ''}
                readOnly
                className="w-24 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-3 flex-1">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Repetições em Reserva:
              </label>
              <input
                type="number"
                value={resistedSummary?.repReserve ?? ''}
                readOnly
                className="w-20 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>
          </div>

          {/* Segunda linha */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 w-60">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Método:
              </label>
              <input
                type="text"
                value={resistedSummary?.method ?? ''}
                readOnly
                className="w-32 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-3 flex-1">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Micro Ciclo:
              </label>
              <input
                type="text"
                value={resistedSummary?.loadCycle ?? ''}
                readOnly
                className="w-32 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-3 flex-1">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Divisão do Treino:
              </label>
              <input
                type="text"
                value={resistedSummary?.trainingDivision ?? ''}
                readOnly
                className="w-32 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
              />
            </div>

            <div className="flex items-center gap-3 flex-1">
              <label className="text-base font-medium text-gray-700 whitespace-nowrap">
                Frequência Semanal:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={resistedSummary?.weeklyFrequency ?? ''}
                  readOnly
                  className="w-20 px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg bg-gray-100 text-center"
                />
                <span className="text-gray-600 font-medium">x/sem</span>
              </div>
            </div>
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
