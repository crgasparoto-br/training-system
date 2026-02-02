import { useState } from 'react';

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

  // Estado inicial com dados do print
  const [dayData, setDayData] = useState<any>({
    1: { sessionDurationMin: 74, stimulusDurationMin: 25, location: 'Esteira', method: 'CEXT', intensity1: 50, intensity2: 60, numSessions: 1, targetHrMin: 105.5, targetHrMax: 116.2, targetSpeedMin: 8.5, targetSpeedMax: 10.9 },
    2: { sessionDurationMin: 52, stimulusDurationMin: 5, location: 'Bicicleta', method: 'IINT', intensity2: 120, numSessions: 1, numSets: 5 },
    3: { sessionDurationMin: 14, stimulusDurationMin: null, location: '', method: '' },
    4: { sessionDurationMin: 50, stimulusDurationMin: 6, location: 'Corda', method: 'IINT', intensity2: 120, numSessions: 2, numSets: 1, sessionTime: 180 },
    5: { sessionDurationMin: 84, stimulusDurationMin: 35, location: 'Esteira', method: 'CEXT', intensity1: 50, intensity2: 60, targetHrMin: 105.5, targetHrMax: 116.2, targetSpeedMin: 8.5, targetSpeedMax: 10.9 },
    6: { sessionDurationMin: 14, stimulusDurationMin: null, location: 'Pista', method: '' },
    7: { sessionDurationMin: 0, stimulusDurationMin: null, location: '', method: '' }
  });

  const handleChange = (dayOfWeek: number, field: string, value: any) => {
    const newDayData = {
      ...dayData,
      [dayOfWeek]: {
        ...dayData[dayOfWeek],
        [field]: value
      }
    };
    setDayData(newDayData);
    onChange({ ...templateData, workoutDays: newDayData });
  };

  const renderCell = (dayOfWeek: number, field: string, type: 'number' | 'select' | 'textarea' = 'number', options?: string[]) => {
    const value = dayData[dayOfWeek]?.[field] || '';

    if (type === 'select' && options) {
      return (
        <select
          value={value}
          onChange={(e) => handleChange(dayOfWeek, field, e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          <option value="">-</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(e) => handleChange(dayOfWeek, field, e.target.value)}
          rows={3}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      );
    }

    return (
      <input
        type="number"
        step={field.includes('intensity') || field.includes('Speed') || field.includes('Hr') ? '0.1' : '1'}
        value={value}
        onChange={(e) => handleChange(dayOfWeek, field, e.target.value ? parseFloat(e.target.value) : null)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Resumo Cíclico da Semana */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Resumo Cíclico da Semana
        </h3>

        <div className="space-y-3">
          {/* Volume Total (min) */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Volume Total (min)</div>
            <div className="grid grid-cols-8 gap-2 text-center">
              <div>
                <div className="text-xs text-gray-600 mb-1">Zona</div>
                <div className="text-xs font-medium bg-white rounded px-2 py-1">71</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">72</div>
                <div className="text-xs font-medium bg-white rounded px-2 py-1">72</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">73</div>
                <div className="text-xs font-medium bg-white rounded px-2 py-1">0</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">74</div>
                <div className="text-xs font-medium bg-white rounded px-2 py-1">0</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">75</div>
                <div className="text-xs font-medium bg-white rounded px-2 py-1">0</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Total</div>
                <div className="text-xs font-medium bg-white rounded px-2 py-1">284</div>
              </div>
            </div>
          </div>

          {/* Distribuição */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">Distribuição (%)</div>
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
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-white rounded px-3 py-2">
              <span className="text-gray-600">Absoluto:</span>
              <span className="ml-2 font-medium text-gray-900">0</span>
            </div>
            <div className="bg-white rounded px-3 py-2">
              <span className="text-gray-600">Planejamento:</span>
              <span className="ml-2 font-medium text-gray-900">60</span>
            </div>
            <div className="bg-white rounded px-3 py-2">
              <span className="text-gray-600">Restante:</span>
              <span className="ml-2 font-medium text-red-600">-60</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Dias da Semana */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300">
          {/* Header */}
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-900 min-w-[180px]">
                Parâmetro
              </th>
              {days.map((day) => (
                <th key={day.dayOfWeek} className="border border-gray-300 px-3 py-2 text-center text-sm font-semibold text-gray-900 min-w-[120px]">
                  <div>{day.date}</div>
                  <div className="font-normal text-xs text-gray-600">{day.label}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Tempo da sessão */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Tempo da sessão
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'sessionDurationMin')}
                </td>
              ))}
            </tr>

            {/* Tempo do estímulo */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Tempo do estímulo
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'stimulusDurationMin')}
                </td>
              ))}
            </tr>

            {/* Local */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Local
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'location', 'select', ['Esteira', 'Bicicleta', 'Pista', 'Corda', 'Rua'])}
                </td>
              ))}
            </tr>

            {/* Método */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Método
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'method', 'select', ['CEXT', 'CINT', 'IEXT', 'IINT'])}
                </td>
              ))}
            </tr>

            {/* Intensidade 1 */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Intensidade 1
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'intensity1')}
                </td>
              ))}
            </tr>

            {/* Intensidade 2 */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Intensidade 2
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'intensity2')}
                </td>
              ))}
            </tr>

            {/* Inserção */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Inserção
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'insertion')}
                </td>
              ))}
            </tr>

            {/* Nº sessões */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Nº sessões
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'numSessions')}
                </td>
              ))}
            </tr>

            {/* Nº de séries */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Nº de séries
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'numSets')}
                </td>
              ))}
            </tr>

            {/* Tempo intenso */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Tempo intenso
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'sessionTime')}
                </td>
              ))}
            </tr>

            {/* Tempo repouso */}
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Tempo repouso
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'restTime')}
                </td>
              ))}
            </tr>

            {/* %VO2Máx interv. */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                %VO2Máx interv.
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'vo2MaxInterval')}
                </td>
              ))}
            </tr>

            {/* Tempo IEXT IINT */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Tempo IEXT IINT
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'iextIintTime')}
                </td>
              ))}
            </tr>

            {/* %VO2Máx */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                %VO2Máx
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'vo2Max')}
                </td>
              ))}
            </tr>

            {/* FC alvo */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                FC alvo
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  <div className="flex gap-1">
                    {renderCell(day.dayOfWeek, 'targetHrMin')}
                    <span className="text-xs text-gray-500 self-center">-</span>
                    {renderCell(day.dayOfWeek, 'targetHrMax')}
                  </div>
                </td>
              ))}
            </tr>

            {/* Velocidade */}
            <tr className="bg-pink-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Velocidade
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  <div className="flex gap-1">
                    {renderCell(day.dayOfWeek, 'targetSpeedMin')}
                    <span className="text-xs text-gray-500 self-center">-</span>
                    {renderCell(day.dayOfWeek, 'targetSpeedMax')}
                  </div>
                </td>
              ))}
            </tr>

            {/* Detalhamento */}
            <tr className="bg-yellow-50">
              <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                Detalhamento
              </td>
              {days.map((day) => (
                <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                  {renderCell(day.dayOfWeek, 'detailNotes', 'textarea')}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
