import { useState, useEffect, useMemo, useRef } from 'react';

interface WorkoutBuilderCyclicProps {
  templateData: any;
  onChange: (data: any) => void;
}

export default function WorkoutBuilderCyclic({ templateData, onChange }: WorkoutBuilderCyclicProps) {
  const lastHydratedKey = useRef<string | null>(null);
  const normalizeWorkoutDays = (workoutDays: any) => {
    if (Array.isArray(workoutDays)) {
      return workoutDays.reduce<Record<number, any>>((acc, day) => {
        acc[day.dayOfWeek] = {
          ...day,
          complementNotes: day.complementNotes ?? day.complemento ?? ''
        };
        return acc;
      }, {});
    }
    if (workoutDays && typeof workoutDays === 'object') {
      return Object.entries(workoutDays).reduce<Record<number, any>>((acc, [key, day]) => {
        const dayOfWeek = day?.dayOfWeek ?? Number(key);
        acc[dayOfWeek] = {
          ...day,
          dayOfWeek,
          complementNotes: day?.complementNotes ?? day?.complemento ?? ''
        };
        return acc;
      }, {});
    }
    return workoutDays;
  };
  const days = useMemo(() => {
    const labels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const start = templateData?.weekStartDate ? new Date(templateData.weekStartDate) : new Date();

    return labels.map((label, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');

      return {
        dayOfWeek: index + 1,
        label,
        date: `${day}/${month}`
      };
    });
  }, [templateData?.weekStartDate]);

  const getWorkoutDate = (dayOfWeek: number) => {
    const start = templateData?.weekStartDate ? new Date(templateData.weekStartDate) : new Date();
    const date = new Date(start);
    date.setDate(start.getDate() + (dayOfWeek - 1));
    return date.toISOString();
  };

  const [dayData, setDayData] = useState<any>({});

  // Estado para Volume Total (virá da periodização)
  const [volumeTotalMin, setVolumeTotalMin] = useState(templateData?.totalVolumeMin || 284);
  const [volumeTotalKm, setVolumeTotalKm] = useState(templateData?.totalVolumeKm || 0);
  
  // Distribuição vem da periodização (% Z1, Z2, Z3, Z4, Z5)
  const [distribution, setDistribution] = useState({
    z1: templateData?.distributionZ1 || 25,
    z2: templateData?.distributionZ2 || 40,
    z3: templateData?.distributionZ3 || 20,
    z4: templateData?.distributionZ4 || 10,
    z5: templateData?.distributionZ5 || 5
  });
  
  // Planejamento (editável)
  const [planning, setPlanning] = useState({
    z1: 60,
    z2: 0,
    z3: 0,
    z4: 0,
    z5: 0
  });

  // Hidratar dados quando o template mudar (evita sobrescrever edição)
  useEffect(() => {
    if (!templateData) return;
    const templateKey = `${templateData.id || ''}:${templateData.planId || ''}:${templateData.mesocycleNumber || ''}:${templateData.weekNumber || ''}`;
    if (lastHydratedKey.current === templateKey) return;

    if (templateData.workoutDays) {
      setDayData(normalizeWorkoutDays(templateData.workoutDays));
    } else {
      setDayData({});
    }

    setVolumeTotalMin(templateData.totalVolumeMin || 284);
    setVolumeTotalKm(templateData.totalVolumeKm || 0);
    setDistribution({
      z1: templateData.distributionZ1 || 25,
      z2: templateData.distributionZ2 || 40,
      z3: templateData.distributionZ3 || 20,
      z4: templateData.distributionZ4 || 10,
      z5: templateData.distributionZ5 || 5
    });

    lastHydratedKey.current = templateKey;
  }, [templateData]);

  useEffect(() => {
    if (!templateData) return;
    onChange({
      ...templateData,
      totalVolumeMin: volumeTotalMin,
      totalVolumeKm: volumeTotalKm,
      distributionZ1: distribution.z1,
      distributionZ2: distribution.z2,
      distributionZ3: distribution.z3,
      distributionZ4: distribution.z4,
      distributionZ5: distribution.z5,
      planningZ1: planning.z1,
      planningZ2: planning.z2,
      planningZ3: planning.z3,
      planningZ4: planning.z4,
      planningZ5: planning.z5,
    });
  }, [volumeTotalMin, volumeTotalKm, distribution, planning]);

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

  // Funções de cálculo
  const calculateTempoIntenso = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    if (!data?.sessionTime || !data?.numSets || !data?.numSessions) return 0;
    return (data.sessionTime / 60) * data.numSets * data.numSessions;
  };

  const calculateTempoRepouso = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    if (!data?.restTime || !data?.numSets || !data?.numSessions) return 0;
    return (data.restTime / 60) * data.numSets * data.numSessions;
  };

  const calculateTempoIEXTIINT = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    if (data?.method === 'IEXT' || data?.method === 'IINT') {
      return calculateTempoIntenso(dayOfWeek) + calculateTempoRepouso(dayOfWeek);
    }
    return null;
  };

  const calculateVO2Max = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    if (data?.intensity1 !== null && data?.intensity1 !== undefined && 
        data?.intensity2 !== null && data?.intensity2 !== undefined) {
      return ((data.intensity1 + data.intensity2) / 2) / 100;
    }
    return null;
  };

  const generateDetalhamento = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    if (!data?.method) return '';

    if (data.method === 'CEXT' || data.method === 'CINT') {
      const sessionDuration = data.sessionDurationMin || 0;
      const numSessions = data.numSessions || 1;
      const durationPerSession = sessionDuration / numSessions;
      const minDuration = durationPerSession - 3;
      const maxDuration = durationPerSession;
      
      let text = `Mantenha ${minDuration}-${maxDuration}min em intensidade constante com frequência cardíaca entre ${data.targetHrMin || 0} bpm`;
      
      if (data.intensity1 && data.intensity2) {
        text += ` (${data.intensity1 * 100} - ${data.intensity2 * 100}% VO2Máx`;
      }
      
      if (data.location === 'Esteira' || data.location === 'Pista') {
        text += ` -> ${data.targetSpeedMin || 0}km/h`;
      }
      
      text += ')';
      return text;
    }

    if (data.method === 'IEXT' || data.method === 'IINT') {
      const numSets = data.numSets || 0;
      const sessionTime = data.sessionTime || 0;
      const restTime = data.restTime || 0;
      
      let text = `${numSets}x (`;
      
      // Tempo intenso
      if (sessionTime >= 60) {
        text += `${Math.floor(sessionTime / 60)}m `;
      }
      const remainingSeconds = sessionTime % 60;
      if (remainingSeconds > 0) {
        text += `${remainingSeconds}s `;
      }
      
      if (data.intensity2 === 1.2) {
        text += 'all out';
      } else if (data.targetHrMin) {
        text += `a ${data.targetHrMin} bpm`;
      }
      
      if (data.location === 'Esteira' || data.location === 'Pista') {
        text += ` -> ${data.targetSpeedMin || 0}km/h`;
      }
      
      // Tempo repouso
      if (restTime > 0) {
        text += ' + ';
        if (restTime >= 60) {
          text += `${Math.floor(restTime / 60)}m `;
        }
        const remainingRestSeconds = restTime % 60;
        if (remainingRestSeconds > 0) {
          text += `${remainingRestSeconds}s `;
        }
        text += 'repouso';
      }
      
      text += ')';
      return text;
    }

    return '';
  };

  const handleChange = (dayOfWeek: number, field: string, value: any) => {
    const currentDay = dayData[dayOfWeek] || { dayOfWeek };
    const newDayData = {
      ...dayData,
      [dayOfWeek]: {
        ...currentDay,
        dayOfWeek,
        workoutDate: getWorkoutDate(dayOfWeek),
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
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Volume Total (min)
              </label>
              <input
                type="number"
                value={volumeTotalMin}
                onChange={(e) => setVolumeTotalMin(parseInt(e.target.value) || 0)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              />
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Volume Total (km)
              </label>
              <input
                type="number"
                step="0.1"
                value={volumeTotalKm}
                onChange={(e) => setVolumeTotalKm(parseFloat(e.target.value) || 0)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              />
            </div>
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
              {/* Distribuição (%) - vem da periodização (BLOQUEADO) */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Distribuição (%)
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  <span
                    className="text-sm text-center tabular-nums"
                    title="Valor vinculado à periodização (somente leitura)"
                  >
                    {distribution.z1}
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  <span
                    className="text-sm text-center tabular-nums"
                    title="Valor vinculado à periodização (somente leitura)"
                  >
                    {distribution.z2}
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  <span
                    className="text-sm text-center tabular-nums"
                    title="Valor vinculado à periodização (somente leitura)"
                  >
                    {distribution.z3}
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  <span
                    className="text-sm text-center tabular-nums"
                    title="Valor vinculado à periodização (somente leitura)"
                  >
                    {distribution.z4}
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                  <span
                    className="text-sm text-center tabular-nums"
                    title="Valor vinculado à periodização (somente leitura)"
                  >
                    {distribution.z5}
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold tabular-nums bg-blue-50">
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

              {/* Tempo IEXT IINT - CALCULADO */}
              <tr className="bg-pink-50">
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Tempo IEXT IINT
                </td>
                {days.map((day) => {
                  const tempoIEXTIINT = calculateTempoIEXTIINT(day.dayOfWeek);
                  return (
                    <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2 bg-gray-100 text-center text-sm">
                      {tempoIEXTIINT !== null ? tempoIEXTIINT.toFixed(1) : ''}
                    </td>
                  );
                })}
              </tr>

              {/* %VO2Máx - CALCULADO */}
              <tr className="bg-pink-50">
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  %VO2Máx
                </td>
                {days.map((day) => {
                  const vo2Max = calculateVO2Max(day.dayOfWeek);
                  return (
                    <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2 bg-gray-100 text-center text-sm">
                      {vo2Max !== null ? `${(vo2Max * 100).toFixed(0)}%` : ''}
                    </td>
                  );
                })}
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

              {/* Detalhamento - GERADO AUTOMATICAMENTE */}
              <tr className="bg-yellow-50">
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Detalhamento
                </td>
                {days.map((day) => {
                  const detalhamento = generateDetalhamento(day.dayOfWeek);
                  const complemento = dayData[day.dayOfWeek]?.complementNotes || '';
                  const detalhamentoFinal = complemento
                    ? `${detalhamento}${detalhamento ? '\n' : ''}${complemento}`
                    : detalhamento;
                  return (
                    <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                      <div className="text-xs text-gray-700 whitespace-pre-wrap">
                        {detalhamentoFinal}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Complemento - TEXTO LIVRE */}
              <tr className="bg-yellow-50">
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  Complemento
                </td>
                {days.map((day) => (
                  <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                    {renderCell(day.dayOfWeek, 'complementNotes', 'textarea')}
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
