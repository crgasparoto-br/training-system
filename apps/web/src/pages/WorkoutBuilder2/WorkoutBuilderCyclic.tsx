import { useState, useEffect, useMemo, useRef } from 'react';
import { isDateWithinRange, parseDateOnly, toDateInputValue, toIsoDateAtNoonUTC } from '../../utils/date';

interface WorkoutBuilderCyclicProps {
  templateData: any;
  onChange: (data: any) => void;
  planId?: string;
  weekStartDateOverride?: string | null;
  dayEditability?: boolean[];
  weekEditable?: boolean;
  planStartDate?: string | Date | null;
  planEndDate?: string | Date | null;
  alunoData?: {
    restingHeartRate?: number | null;
    maxHeartRate?: number | null;
  } | null;
  vamValue?: number | null;
  mesocycleNumber?: number;
  weekNumber?: number;
}

export default function WorkoutBuilderCyclic({
  templateData,
  onChange,
  planId,
  weekStartDateOverride,
  dayEditability,
  weekEditable = true,
  planStartDate,
  planEndDate,
  alunoData,
  vamValue,
  mesocycleNumber,
  weekNumber
}: WorkoutBuilderCyclicProps) {
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
        const rawDay = (day ?? {}) as Record<string, any>;
        const dayOfWeek = Number(rawDay.dayOfWeek ?? key);
        acc[dayOfWeek] = {
          ...rawDay,
          dayOfWeek,
          complementNotes: rawDay.complementNotes ?? rawDay.complemento ?? ''
        };
        return acc;
      }, {});
    }
    return workoutDays;
  };

  const startWeekday = useMemo(() => {
    const start = parseDateOnly(weekStartDateOverride ?? templateData?.weekStartDate) ?? new Date();
    const startJsDay = start.getDay();
    return startJsDay === 0 ? 7 : startJsDay; // 1=Seg ... 7=Dom
  }, [templateData?.weekStartDate, weekStartDateOverride]);

  const resolveDayDate = (dayOfWeek: number) => {
    const start = parseDateOnly(weekStartDateOverride ?? templateData?.weekStartDate) ?? new Date();
    const offset = dayOfWeek - startWeekday;
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    return date;
  };

  const isDayEditable = (dayOfWeek: number) => {
    if (!weekEditable) return false;
    if (dayEditability && dayEditability[dayOfWeek - 1] !== undefined) {
      return dayEditability[dayOfWeek - 1];
    }
    if (!planStartDate || !planEndDate) return true;
    const start = parseDateOnly(planStartDate);
    const end = parseDateOnly(planEndDate);
    if (!start || !end) return true;
    return isDateWithinRange(resolveDayDate(dayOfWeek), start, end);
  };

  const days = useMemo(() => {
    const labels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

    return labels.map((label, index) => {
      const dayOfWeek = index + 1;
      const date = resolveDayDate(dayOfWeek);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');

      return {
        dayOfWeek,
        label,
        date: `${day}/${month}`
      };
    });
  }, [templateData?.weekStartDate, weekStartDateOverride, startWeekday]);

  const getWorkoutDate = (dayOfWeek: number) => {
    const date = resolveDayDate(dayOfWeek);
    return toIsoDateAtNoonUTC(toDateInputValue(date));
  };

  const normalizeIntensity = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return value / 100;
  };

  const toPercentValue = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return value <= 1.5 ? value * 100 : value;
  };

  const calculateTargetHrValues = (intensity1: number | null, intensity2: number | null) => {
    if (intensity1 === null || intensity2 === null) return null;
    const fcRep = alunoData?.restingHeartRate ?? null;
    const fcMax = alunoData?.maxHeartRate ?? null;
    if (fcRep === null || fcMax === null) return null;
    const pct1 = normalizeIntensity(intensity1);
    const pct2 = normalizeIntensity(intensity2);
    if (pct1 === null || pct2 === null) return null;
    const hr1 = fcRep + (fcMax - fcRep) * pct1;
    const hr2 = fcRep + (fcMax - fcRep) * pct2;
    return { hrMin: hr1, hrMax: hr2 };
  };

  const calculateTargetSpeedValues = (intensity1: number | null, intensity2: number | null) => {
    if (intensity1 === null || intensity2 === null) return null;
    if (vamValue === null || vamValue === undefined) return null;
    const pct1 = normalizeIntensity(intensity1);
    const pct2 = normalizeIntensity(intensity2);
    if (pct1 === null || pct2 === null) return null;
    const speed1 = vamValue * pct1;
    const speed2 = vamValue * pct2;
    return { speedMin: speed1, speedMax: speed2 };
  };


  const formatHrValue = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const formatSpeedValue = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };


  const getTargetHrText = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    const intensity1 = data?.intensity1 ?? null;
    const intensity2 = data?.intensity2 ?? null;
    if (intensity1 === null || intensity1 === undefined) return '';
    const computed = calculateTargetHrValues(intensity1, intensity2);
    if (!computed) return '';
    return `${formatHrValue(computed.hrMin)} - ${formatHrValue(computed.hrMax)}`;
  };

  const getTargetSpeedText = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    const intensity1 = data?.intensity1 ?? null;
    const intensity2 = data?.intensity2 ?? null;
    if (intensity1 === null || intensity1 === undefined) return '';
    const computed = calculateTargetSpeedValues(intensity1, intensity2);
    if (!computed) return '';
    return `${formatSpeedValue(computed.speedMin)} - ${formatSpeedValue(computed.speedMax)}`;
  };

  const [dayData, setDayData] = useState<any>({});
  const summaryStorageKey = useMemo(() => {
    const planKey = planId ?? templateData?.planId ?? 'unknown-plan';
    const mesoKey = mesocycleNumber ?? templateData?.mesocycleNumber ?? 'unknown-meso';
    const weekKey = weekNumber ?? templateData?.weekNumber ?? 'unknown-week';
    return `workoutBuilder2:cyclicSummary:${planKey}:${mesoKey}:${weekKey}`;
  }, [planId, mesocycleNumber, weekNumber, templateData?.planId, templateData?.mesocycleNumber, templateData?.weekNumber]);
  const [showCyclicSummary, setShowCyclicSummary] = useState(() => {
    try {
      const stored = localStorage.getItem(summaryStorageKey);
      if (stored !== null) return stored === 'true';
    } catch (error) {
      // ignore storage errors
    }
    return true;
  });

  // Estado para Volume Total (virÃ¡ da periodizaÃ§Ã£o)
  const [volumeTotalMin, setVolumeTotalMin] = useState(templateData?.totalVolumeMin || 284);
  const [volumeTotalKm, setVolumeTotalKm] = useState(templateData?.totalVolumeKm || 0);
  
  // DistribuiÃ§Ã£o vem da periodizaÃ§Ã£o (% Z1, Z2, Z3, Z4, Z5)
  const [distribution, setDistribution] = useState({
    z1: templateData?.distributionZ1 || 25,
    z2: templateData?.distributionZ2 || 40,
    z3: templateData?.distributionZ3 || 20,
    z4: templateData?.distributionZ4 || 10,
    z5: templateData?.distributionZ5 || 5
  });
  
  // Planejamento (editÃ¡vel)
  const [planning] = useState({
    z1: 60,
    z2: 0,
    z3: 0,
    z4: 0,
    z5: 0
  });

  // Hidratar dados quando o template mudar (evita sobrescrever ediÃ§Ã£o)


  // CÃ¡lculos automÃ¡ticos
  const calculateAbsolute = (zone: keyof typeof distribution) => {
    return Math.round(volumeTotalMin * (distribution[zone] / 100));
  };

  const calculateRemaining = (zone: keyof typeof distribution) => {
    const absolute = calculateAbsolute(zone);
    const plan = planningDerived[zone];
    return absolute - plan;
  };

  const getTotalAbsolute = () => {
    return Object.keys(distribution).reduce((sum, zone) => {
      return sum + calculateAbsolute(zone as keyof typeof distribution);
    }, 0);
  };

  const getTotalPlanning = () => {
    return Object.values(planningDerived).reduce((sum, val) => sum + val, 0);
  };

  const getTotalRemaining = () => {
    return getTotalAbsolute() - getTotalPlanning();
  };

  const getTotalDistribution = () => {
    return Object.values(distribution).reduce((sum, val) => sum + val, 0);
  };

  // FunÃ§Ãµes de cÃ¡lculo
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

  const normalizePercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return value > 1.5 ? value / 100 : value;
  };

  const planningZ1Computed = useMemo(() => {
    const total = days.reduce((sum, day) => {
      const dayOfWeek = day.dayOfWeek;
      const tempoIntenso = calculateTempoIntenso(dayOfWeek);
      const tempoRepouso = calculateTempoRepouso(dayOfWeek);
      const tempoEstimulo = Number(dayData[dayOfWeek]?.stimulusDurationMin) || 0;
      const vo2Max = calculateVO2Max(dayOfWeek);
      const vo2MaxInterv = normalizePercent(dayData[dayOfWeek]?.vo2MaxInterval ?? null);

      if (vo2Max !== null && vo2Max <= 0.6) {
        sum += tempoIntenso;
        if (tempoIntenso === 0) {
          sum += tempoEstimulo;
        }
      }

      if (vo2MaxInterv !== null && vo2MaxInterv <= 0.6) {
        sum += tempoRepouso;
      }

      return sum;
    }, 0);

    return Math.round(total);
  }, [days, dayData]);

  const planningZ2Computed = useMemo(() => {
    const total = days.reduce((sum, day) => {
      const dayOfWeek = day.dayOfWeek;
      const tempoIntenso = calculateTempoIntenso(dayOfWeek);
      const tempoRepouso = calculateTempoRepouso(dayOfWeek);
      const tempoEstimulo = Number(dayData[dayOfWeek]?.stimulusDurationMin) || 0;
      const vo2Max = calculateVO2Max(dayOfWeek);
      const vo2MaxInterv = normalizePercent(dayData[dayOfWeek]?.vo2MaxInterval ?? null);

      if (vo2Max !== null && vo2Max > 0.6 && vo2Max <= 0.8) {
        sum += tempoIntenso;
        if (tempoIntenso === 0) {
          sum += tempoEstimulo;
        }
      }

      if (vo2MaxInterv !== null && vo2MaxInterv > 0.6 && vo2MaxInterv <= 0.8) {
        sum += tempoRepouso;
      }

      return sum;
    }, 0);

    return Math.round(total);
  }, [days, dayData]);

  const planningZ3Computed = useMemo(() => {
    const total = days.reduce((sum, day) => {
      const dayOfWeek = day.dayOfWeek;
      const tempoIntenso = calculateTempoIntenso(dayOfWeek);
      const tempoRepouso = calculateTempoRepouso(dayOfWeek);
      const tempoEstimulo = Number(dayData[dayOfWeek]?.stimulusDurationMin) || 0;
      const vo2Max = calculateVO2Max(dayOfWeek);
      const vo2MaxInterv = normalizePercent(dayData[dayOfWeek]?.vo2MaxInterval ?? null);

      if (vo2Max !== null && vo2Max > 0.8 && vo2Max <= 0.9) {
        sum += tempoIntenso;
        if (tempoIntenso === 0) {
          sum += tempoEstimulo;
        }
      }

      if (vo2MaxInterv !== null && vo2MaxInterv > 0.8 && vo2MaxInterv <= 0.9) {
        sum += tempoRepouso;
      }

      return sum;
    }, 0);

    return Math.round(total);
  }, [days, dayData]);

  const planningZ4Computed = useMemo(() => {
    const total = days.reduce((sum, day) => {
      const dayOfWeek = day.dayOfWeek;
      const tempoIntenso = calculateTempoIntenso(dayOfWeek);
      const tempoRepouso = calculateTempoRepouso(dayOfWeek);
      const tempoEstimulo = Number(dayData[dayOfWeek]?.stimulusDurationMin) || 0;
      const vo2Max = calculateVO2Max(dayOfWeek);
      const vo2MaxInterv = normalizePercent(dayData[dayOfWeek]?.vo2MaxInterval ?? null);

      if (vo2Max !== null && vo2Max > 0.9 && vo2Max <= 1) {
        sum += tempoIntenso;
        if (tempoIntenso === 0) {
          sum += tempoEstimulo;
        }
      }

      if (vo2MaxInterv !== null && vo2MaxInterv > 0.9 && vo2MaxInterv <= 1) {
        sum += tempoRepouso;
      }

      return sum;
    }, 0);

    return Math.round(total);
  }, [days, dayData]);

  const planningZ5Computed = useMemo(() => {
    const total = days.reduce((sum, day) => {
      const dayOfWeek = day.dayOfWeek;
      const tempoIntenso = calculateTempoIntenso(dayOfWeek);
      const tempoRepouso = calculateTempoRepouso(dayOfWeek);
      const tempoEstimulo = Number(dayData[dayOfWeek]?.stimulusDurationMin) || 0;
      const vo2Max = calculateVO2Max(dayOfWeek);
      const vo2MaxInterv = normalizePercent(dayData[dayOfWeek]?.vo2MaxInterval ?? null);

      if (vo2Max !== null && vo2Max > 1) {
        sum += tempoIntenso;
        if (tempoIntenso === 0) {
          sum += tempoEstimulo;
        }
      }

      if (vo2MaxInterv !== null && vo2MaxInterv > 1) {
        sum += tempoRepouso;
      }

      return sum;
    }, 0);

    return Math.round(total);
  }, [days, dayData]);

  const planningDerived = useMemo(
    () => ({
      ...planning,
      z1: planningZ1Computed,
      z2: planningZ2Computed,
      z3: planningZ3Computed,
      z4: planningZ4Computed,
      z5: planningZ5Computed
    }),
    [planning, planningZ1Computed, planningZ2Computed, planningZ3Computed, planningZ4Computed, planningZ5Computed]
  );

  useEffect(() => {
    if (!templateData) return;
    const templateKey = `${templateData.id || ''}:${templateData.planId || ''}:${templateData.mesocycleNumber || ''}:${templateData.weekNumber || ''}`;
    if (lastHydratedKey.current === templateKey) return;

    if (templateData.workoutDays) {
      const normalized = normalizeWorkoutDays(templateData.workoutDays);
      const updated: Record<number, any> = { ...normalized };
      Object.keys(updated).forEach((key) => {
        const dayKey = Number(key);
        const current = updated[dayKey];
        const intensity1 = toPercentValue(current?.intensity1 ?? null);
        const intensity2 = toPercentValue(current?.intensity2 ?? null);
        if (intensity1 !== null && intensity1 !== undefined) {
          const hrComputed = calculateTargetHrValues(intensity1, intensity2);
          const speedComputed = calculateTargetSpeedValues(intensity1, intensity2);
          const hrText = hrComputed
            ? `${formatHrValue(hrComputed.hrMin)} - ${formatHrValue(hrComputed.hrMax)}`
            : null;
          const speedText = speedComputed
            ? `${formatSpeedValue(speedComputed.speedMin)} - ${formatSpeedValue(speedComputed.speedMax)}`
            : null;
          updated[dayKey] = {
            ...current,
            intensity1,
            intensity2,
            targetHrMin: hrText,
            targetHrMax: null,
            targetSpeedMin: speedText,
            targetSpeedMax: null,
          };
        } else {
          updated[dayKey] = {
            ...current,
            intensity1: intensity1 ?? null,
            intensity2: intensity2 ?? null,
            targetHrMin: null,
            targetHrMax: null,
            targetSpeedMin: null,
            targetSpeedMax: null,
          };
        }
      });
      setDayData(updated);
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
    if (!alunoData && (vamValue === null || vamValue === undefined)) return;
    if (!dayData || Object.keys(dayData).length === 0) return;
    const updated: Record<number, any> = { ...dayData };
    let changed = false;
    Object.keys(updated).forEach((key) => {
      const dayKey = Number(key);
      const current = updated[dayKey];
      const intensity1 = current?.intensity1 ?? null;
      const intensity2 = current?.intensity2 ?? null;
      if (intensity1 === null || intensity1 === undefined) {
        if (
          current?.targetHrMin !== null ||
          current?.targetHrMax !== null ||
          current?.targetSpeedMin !== null ||
          current?.targetSpeedMax !== null
        ) {
          updated[dayKey] = {
            ...current,
            targetHrMin: null,
            targetHrMax: null,
            targetSpeedMin: null,
            targetSpeedMax: null,
          };
          changed = true;
        }
        return;
      }
      const hrComputed = calculateTargetHrValues(intensity1, intensity2);
      const speedComputed = calculateTargetSpeedValues(intensity1, intensity2);
      const nextMin = hrComputed
        ? `${formatHrValue(hrComputed.hrMin)} - ${formatHrValue(hrComputed.hrMax)}`
        : null;
      const nextSpeedMin = speedComputed
        ? `${formatSpeedValue(speedComputed.speedMin)} - ${formatSpeedValue(speedComputed.speedMax)}`
        : null;
      if (
        current?.targetHrMin !== nextMin ||
        current?.targetSpeedMin !== nextSpeedMin ||
        current?.targetHrMax !== null ||
        current?.targetSpeedMax !== null
      ) {
        updated[dayKey] = {
          ...current,
          targetHrMin: nextMin,
          targetHrMax: null,
          targetSpeedMin: nextSpeedMin,
          targetSpeedMax: null,
        };
        changed = true;
      }
    });
    if (changed) {
      setDayData(updated);
      onChange({ ...templateData, workoutDays: updated });
    }
  }, [alunoData, vamValue]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(summaryStorageKey);
      if (stored !== null) {
        setShowCyclicSummary(stored === 'true');
        return;
      }
    } catch (error) {
      // ignore storage errors
    }
    setShowCyclicSummary(true);
  }, [summaryStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(summaryStorageKey, String(showCyclicSummary));
    } catch (error) {
      // ignore storage errors
    }
  }, [showCyclicSummary, summaryStorageKey]);

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
      planningZ1: planningDerived.z1,
      planningZ2: planning.z2,
      planningZ3: planning.z3,
      planningZ4: planning.z4,
      planningZ5: planning.z5,
    });
  }, [volumeTotalMin, volumeTotalKm, distribution, planning, planningDerived]);

  const generateDetalhamento = (dayOfWeek: number) => {
    const data = dayData[dayOfWeek];
    if (!data?.method) return '';

    if (data.method === 'CEXT' || data.method === 'CINT') {
      const sessionDuration = data.stimulusDurationMin || 0;
      const numSessions = data.numSessions || 1;
      const durationPerSession = sessionDuration / numSessions;
      const minDuration = durationPerSession - 3;
      const maxDuration = durationPerSession;
      
      let text = `Mantenha ${minDuration}-${maxDuration}min em intensidade constante com frequência cardíaca entre ${data.targetHrMin || ''} bpm`;
      
      if (data.intensity1 && data.intensity2) {
        text += ` (${data.intensity1} - ${data.intensity2}% VO2Máx`;
      }
      
      if (data.location === 'Esteira' || data.location === 'Pista') {
        text += ` -> ${data.targetSpeedMin || ''}km/h`;
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
      
      const intensity2Pct = normalizeIntensity(data.intensity2);
      if (intensity2Pct === 1.2) {
        text += 'all out';
      } else if (data.targetHrMin) {
        text += `a ${data.targetHrMin} bpm`;
      }
      
      if (data.location === 'Esteira' || data.location === 'Pista') {
        text += ` -> ${data.targetSpeedMin || ''}km/h`;
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
    const nextIntensity1 =
      field === 'intensity1' ? value : currentDay.intensity1 ?? null;
    const nextIntensity2 =
      field === 'intensity2' ? value : currentDay.intensity2 ?? null;
    const nextStimulusDuration =
      field === 'stimulusDurationMin' ? value : currentDay.stimulusDurationMin ?? null;
    const targetHr =
      nextIntensity1 === null || nextIntensity1 === undefined
        ? null
        : calculateTargetHrValues(nextIntensity1, nextIntensity2);
    const targetSpeed =
      nextIntensity1 === null || nextIntensity1 === undefined
        ? null
        : calculateTargetSpeedValues(nextIntensity1, nextIntensity2);
    const targetHrText = targetHr
      ? `${formatHrValue(targetHr.hrMin)} - ${formatHrValue(targetHr.hrMax)}`
      : null;
    const targetSpeedText = targetSpeed
      ? `${formatSpeedValue(targetSpeed.speedMin)} - ${formatSpeedValue(targetSpeed.speedMax)}`
      : null;
    const newDayData = {
      ...dayData,
      [dayOfWeek]: {
        ...currentDay,
        dayOfWeek,
        workoutDate: getWorkoutDate(dayOfWeek),
        [field]: value,
        sessionDurationMin: nextStimulusDuration ?? currentDay.sessionDurationMin ?? null,
        targetHrMin: targetHrText,
        targetHrMax: null,
        targetSpeedMin: targetSpeedText,
        targetSpeedMax: null,
      }
    };
    setDayData(newDayData);
    onChange({ ...templateData, workoutDays: newDayData });
  };

  const renderCell = (
    dayOfWeek: number,
    field: string,
    type: 'number' | 'select' | 'textarea' = 'number',
    options?: string[]
  ) => {
    const disabled = !isDayEditable(dayOfWeek);
    const disabledClass = disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : '';
    const rawValue = dayData[dayOfWeek]?.[field];
    const value = rawValue ?? '';

    if (type === 'select' && options) {
      return (
        <select
          value={value}
          onChange={(e) => handleChange(dayOfWeek, field, e.target.value)}
          disabled={disabled}
          className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent ${disabledClass}`}
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
          disabled={disabled}
          rows={3}
          className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${disabledClass}`}
        />
      );
    }

    if (field.includes('intensity')) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.1"
            value={value}
            onChange={(e) =>
              handleChange(dayOfWeek, field, e.target.value ? parseFloat(e.target.value) : null)
            }
            disabled={disabled}
            className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center ${disabledClass}`}
          />
          <span className="text-xs text-gray-500">%</span>
        </div>
      );
    }

    return (
      <input
        type="number"
        step={field.includes('Speed') || field.includes('Hr') ? '0.1' : '1'}
        value={value}
        onChange={(e) => handleChange(dayOfWeek, field, e.target.value ? parseFloat(e.target.value) : null)}
        disabled={disabled}
        className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center ${disabledClass}`}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Resumo Cíclico da Semana */}
      <div
        className={`bg-blue-50 rounded-lg border border-blue-200 ${showCyclicSummary ? 'p-4' : 'p-2'}`}
      >
        <div className={`${showCyclicSummary ? 'mb-4' : 'mb-0'} flex items-center justify-between`}>
          <h3 className="text-base font-semibold text-gray-900">
            Resumo Cíclico da Semana
          </h3>
          <button
            type="button"
            onClick={() => setShowCyclicSummary((prev) => !prev)}
            className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            {showCyclicSummary ? 'Ocultar' : 'Exibir'}
          </button>
        </div>

        {showCyclicSummary && (
          <>
            {/* Volume Total (separado) */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-medium text-gray-600">
                    Volume Total (min)
                  </span>
                  <span className="text-lg font-semibold text-gray-900 tabular-nums">
                    {Number.isFinite(volumeTotalMin) ? Math.round(volumeTotalMin) : 0}
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-medium text-gray-600">
                    Volume Total (km)
                  </span>
                  <span className="text-lg font-semibold text-gray-900 tabular-nums">
                    {Number.isFinite(volumeTotalKm) ? Number(volumeTotalKm.toFixed(1)) : 0}
                  </span>
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

                  {/* Planejamento - edit?vel */}
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                      Planejamento
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                      {planningDerived.z1}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                      {planningDerived.z2}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                      {planningDerived.z3}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                      {planningDerived.z4}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center text-sm bg-gray-100">
                      {planningDerived.z5}
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
          </>
        )}
      </div>

{/* Planejamento do Treinamento Cíclico */}
      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Planejamento do Treinamento Cíclico
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse border border-gray-300 bg-white">
            <colgroup>
              <col className="w-[200px]" />
              {days.map((day) => (
                <col key={`col-${day.dayOfWeek}`} className="w-[120px]" />
              ))}
            </colgroup>
            {/* Header */}
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-900">
                  Parâmetro
                </th>
                {days.map((day) => (
                  <th key={day.dayOfWeek} className="border border-gray-300 px-3 py-2 text-center text-sm font-semibold text-gray-900">
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

              {/* InserÃ§Ã£o */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  InserÃ§Ã£o
                </td>
                {days.map((day) => (
                  <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                    {renderCell(day.dayOfWeek, 'insertion')}
                  </td>
                ))}
              </tr>

              {/* NÂº sessÃµes */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  NÂº sessÃµes
                </td>
                {days.map((day) => (
                  <td key={day.dayOfWeek} className="border border-gray-300 px-2 py-2">
                    {renderCell(day.dayOfWeek, 'numSessions')}
                  </td>
                ))}
              </tr>

              {/* NÂº de sÃ©ries */}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  NÂº de sÃ©ries
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

              {/* %VO2MÃ¡x interv. */}
              <tr className="bg-pink-50">
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  %VO2MÃ¡x interv.
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

              {/* %VO2MÃ¡x - CALCULADO */}
              <tr className="bg-pink-50">
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                  %VO2MÃ¡x
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
                    <div className="text-center text-sm font-medium text-gray-800">
                      {getTargetHrText(day.dayOfWeek)}
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
                    <div className="text-center text-sm font-medium text-gray-800">
                      {getTargetSpeedText(day.dayOfWeek)}
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


