import { useState } from 'react';
import CyclicDayColumn from './CyclicDayColumn';

interface WorkoutBuilderCyclicProps {
  templateData: any;
  onChange: (data: any) => void;
}

export default function WorkoutBuilderCyclic({ templateData, onChange }: WorkoutBuilderCyclicProps) {
  const days = [
    { dayOfWeek: 1, label: 'Segunda', date: '12/1' },
    { dayOfWeek: 2, label: 'Terça', date: '13/1' },
    { dayOfWeek: 3, label: 'Quarta', date: '14/1' },
    { dayOfWeek: 4, label: 'Quinta', date: '15/1' },
    { dayOfWeek: 5, label: 'Sexta', date: '16/1' },
    { dayOfWeek: 6, label: 'Sábado', date: '17/1' },
    { dayOfWeek: 7, label: 'Domingo', date: '18/1' }
  ];

  const [dayData, setDayData] = useState<any>({
    1: { sessionDurationMin: 74, stimulusDurationMin: 25, location: 'Esteira', method: 'CEXT' },
    2: { sessionDurationMin: 52, stimulusDurationMin: 5, location: 'Bicicleta', method: 'IINT' },
    3: { sessionDurationMin: 14, stimulusDurationMin: null, location: '', method: '' },
    4: { sessionDurationMin: 50, stimulusDurationMin: 6, location: 'Corda', method: 'IINT' },
    5: { sessionDurationMin: 84, stimulusDurationMin: 35, location: 'Esteira', method: 'CEXT' },
    6: { sessionDurationMin: 14, stimulusDurationMin: null, location: 'Pista', method: '' },
    7: { sessionDurationMin: 0, stimulusDurationMin: null, location: '', method: '' }
  });

  const handleDayChange = (dayOfWeek: number, data: any) => {
    const newDayData = { ...dayData, [dayOfWeek]: data };
    setDayData(newDayData);
    onChange({ ...templateData, workoutDays: newDayData });
  };

  return (
    <div className="space-y-6">
      {/* Resumo Cíclico da Semana */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Resumo Cíclico da Semana
        </h3>

        <div className="space-y-4">
          {/* Volume Total (min) */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Volume Total (min)</h4>
            <div className="grid grid-cols-8 gap-2">
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">Zona</div>
                <div className="text-xs font-medium text-gray-900">71</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">72</div>
                <div className="text-xs font-medium text-gray-900">72</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">73</div>
                <div className="text-xs font-medium text-gray-900">0</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">74</div>
                <div className="text-xs font-medium text-gray-900">0</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">75</div>
                <div className="text-xs font-medium text-gray-900">0</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">Total</div>
                <div className="text-xs font-medium text-gray-900">284</div>
              </div>
            </div>
          </div>

          {/* Distribuição */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Distribuição (%)</h4>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>25%</span>
              <span>|</span>
              <span>40%</span>
              <span>|</span>
              <span>20%</span>
              <span>|</span>
              <span>10%</span>
              <span>|</span>
              <span>5%</span>
              <span>=</span>
              <span className="font-medium text-gray-900">100%</span>
            </div>
          </div>

          {/* Absoluto, Planejamento, Restante */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm text-gray-600">Absoluto:</span>
              <span className="ml-2 text-sm font-medium text-gray-900">0</span>
            </div>
            <div>
              <span className="text-sm text-gray-600">Planejamento:</span>
              <span className="ml-2 text-sm font-medium text-gray-900">60</span>
            </div>
            <div>
              <span className="text-sm text-gray-600">Restante:</span>
              <span className="ml-2 text-sm font-medium text-red-600">-60</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dias da Semana - Layout Horizontal */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Dias da Semana
        </h3>

        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max pb-4">
            {days.map((day) => (
              <CyclicDayColumn
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
      </div>

      {/* Observações Gerais */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Observações Gerais
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Objetivo Aluno
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Digite o objetivo do aluno..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Objetivo Meso
            </label>
            <input
              type="text"
              defaultValue="Força"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Digite o objetivo do mesociclo..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observação 1
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Digite observações adicionais..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
