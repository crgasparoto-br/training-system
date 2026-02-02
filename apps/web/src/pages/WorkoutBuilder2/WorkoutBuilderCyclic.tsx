import { useState, useEffect } from 'react';

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

  // Estado para Volume Total e Distribuição (virá da periodização)
  const [volumeTotalMin, setVolumeTotalMin] = useState(284);
  const [volumeTotalKm, setVolumeTotalKm] = useState(0);
  
  // Distribuição vem da periodização (% Z1, Z2, Z3, Z4, Z5)
  const [distribution, setDistribution] = useState({
    z1: 25,
    z2: 40,
    z3: 20,
    z4: 10,
    z5: 5
  });

  // Planejamento (editável)
  const [planning, setPlanning] = useState({
    z1: 60,
    z2: 0,
    z3: 0,
    z4: 0,
    z5: 0
  });

  // Cálculos automáticos
  const calculateAbsolute = (zone: keyof typeof distribution) => {
    return Math.round(volumeTotalMin * (distribution[zone] / 100));
  };

  const calculateRemaining = (zone: keyof typeof distribution) => {
    const absolute = calculateAbsolute(zone);
    const plan = planning[zone];
    return absolute - plan;
  };

  const getTotalAbsolute = () => {
    return Object.keys(distribution).reduce((sum, zone) => {
      return sum + calculateAbsolute(zone as keyof typeof distribution);
    }, 0);
  };

  const getTotalPlanning = () => {
    return Object.values(planning).reduce((sum, val) => sum + val, 0);
  };

  const getTotalRemaining = () => {
    return getTotalAbsolute() - getTotalPlanning();
  };

  const getTotalDistribution = () => {
    return Object.values(distribution).reduce((sum, val) => sum + val, 0);
  };

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
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Resumo Cíclico da Semana
        </h3>

        {/* Volume Total (separado) */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Volume Total (min)
            </label>
            <input
              type="number"
              value={volumeTotalMin}
              onChange={(e) => setVolumeTotalMin(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Volume Total (km)
            </label>
            <input
              type="number"
              step="0.1"
              value={volumeTotalKm}
              onChange={(e) => setVolumeTotalKm(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Tabela de Zonas */}
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 bg-white">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-900">
                  Zonas
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-900">
                  Z1
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-900">
                  Z2
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-900">
                  Z3
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-900">
                  Z4
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-900">
                  Z5
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-900 bg-blue-100">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Distribuição (%) - vem da periodização */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Distribuição (%)
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={distribution.z1}
                    onChange={(e) => setDistribution({ ...distribution, z1: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={distribution.z2}
                    onChange={(e) => setDistribution({ ...distribution, z2: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={distribution.z3}
                    onChange={(e) => setDistribution({ ...distribution, z3: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={distribution.z4}
                    onChange={(e) => setDistribution({ ...distribution, z4: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={distribution.z5}
                    onChange={(e) => setDistribution({ ...distribution, z5: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold bg-blue-50">
                  {getTotalDistribution()}
                </td>
              </tr>

              {/* Absoluto - calculado automaticamente */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Absoluto
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  {calculateAbsolute('z1')}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  {calculateAbsolute('z2')}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  {calculateAbsolute('z3')}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  {calculateAbsolute('z4')}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  {calculateAbsolute('z5')}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold bg-blue-50">
                  {getTotalAbsolute()}
                </td>
              </tr>

              {/* Planejamento - editável */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Planejamento
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={planning.z1}
                    onChange={(e) => setPlanning({ ...planning, z1: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={planning.z2}
                    onChange={(e) => setPlanning({ ...planning, z2: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={planning.z3}
                    onChange={(e) => setPlanning({ ...planning, z3: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={planning.z4}
                    onChange={(e) => setPlanning({ ...planning, z4: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                  <input
                    type="number"
                    value={planning.z5}
                    onChange={(e) => setPlanning({ ...planning, z5: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold bg-blue-50">
                  {getTotalPlanning()}
                </td>
              </tr>

              {/* Restante - calculado automaticamente */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Restante
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-center text-sm font-medium bg-gray-100 ${calculateRemaining('z1') < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {calculateRemaining('z1')}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-center text-sm font-medium bg-gray-100 ${calculateRemaining('z2') < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {calculateRemaining('z2')}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-center text-sm font-medium bg-gray-100 ${calculateRemaining('z3') < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {calculateRemaining('z3')}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-center text-sm font-medium bg-gray-100 ${calculateRemaining('z4') < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {calculateRemaining('z4')}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-center text-sm font-medium bg-gray-100 ${calculateRemaining('z5') < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {calculateRemaining('z5')}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-center text-sm font-semibold bg-blue-50 ${getTotalRemaining() < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {getTotalRemaining()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Planejamento do Treinamento Cíclico */}
      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Planejamento do Treinamento Cíclico
        </h3>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 bg-white">
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
    </div>
  );
}
