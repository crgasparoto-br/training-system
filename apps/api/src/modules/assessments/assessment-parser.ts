export interface ParsedAssessmentData {
  metrics: Record<string, number | null>;
  variables: Record<string, number | null>;
}

export const assessmentVariableLabels = [
  'Peso',
  'Estatura',
  'Escapular',
  'Torácica Inspirada',
  'Torácica Expirada',
  'Abdominal',
  'Quadril',
  'Br. Dir. Rel.',
  'Br. Dir. Con.',
  'Coxa Dir.',
  'Perna Dir.',
  'Br. Esq. Rel.',
  'Br. Esq. Con.',
  'Coxa Esq.',
  'Perna Esq.',
  'D.C. Tricipital',
  'D.C. Subescapular',
  'D.C. Suprailíaca',
  'D.C. Abdominal',
  'D.C. Coxa',
  'Total de Dobras',
  '% Gordura',
  'Gordura Absoluta',
  'Massa Magra',
  'Massa Muscular',
  'Nível de Gordura Visceral',
  'Área Muscular do Braço - UMA',
  'IMC',
  'M. Perna Direita',
  'M. Perna Esquerda',
  'M. Braço Direito',
  'M. Braço Esquerdo',
  'M. Tronco',
  'G. Perna Direita',
  'G. Perna Esquerda',
  'G. Braço Direito',
  'G. Braço Esquerdo',
  'G. Tronco',
  'Anteriores do Braço',
  'Posteriores do Braço',
  'Reto Femoral',
  'Vasto Intermédio',
  'Anteriores da Coxa',
  'Abdominal Superficial',
  'Abdominal Profundo',
  'Abdominal Supra Muscular Total',
  'Compartimento Anterior do Braço',
  'Compartimento Posterior do Braço',
  'Compartimento Anterior da Coxa',
  'Perímetro Abdominal',
  'Relação Abdome-Quadril',
  'Risco Coronariano Atual',
  'RML Abdominal',
  'R. Abdominal',
  'Flexibilidade',
  'R. Flexibilidade',
  'Protocolo',
  'FC Repouso',
  'VO2máximo',
  'R. VO2máximo',
  'Limiar Anaeróbico (bpm)',
  'Limiar Anaeróbico (km/h ou watt)',
  'Limiar Anaeróbico (pace)',
  'Velocidade Máxima (km/h ou watt)',
  'FC Máxima Predita',
  'FC Máxima no Teste',
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w%./,\s-]/g, ' ')
    .toLowerCase();

const normalizeLabel = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w%./,\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizeLabelForMatch = (value: string) => {
  let normalized = normalizeLabel(value);
  normalized = normalized
    .replace(/\s+(cm|mm|kg|%|bpm|kmh|km\/h|watt)$/i, '')
    .trim();
  return normalized;
};

const parseNumber = (raw?: string | null) => {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  cleaned = cleaned.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractNumbersForRow = (line: string) => {
  const sanitized = line.replace(/(?<=\d)-(?=\d)/g, ' ');
  const compact = sanitized.replace(/\s+/g, '');
  const oneDecimal = compact.match(/-?\d{1,3},\d/g) || [];
  const twoDecimals = compact.match(/-?\d{1,3},\d{1,2}/g) || [];
  const startsWithZero = compact.startsWith('0,');
  if (startsWithZero && twoDecimals.length >= 4) {
    return twoDecimals;
  }
  if (oneDecimal.length >= 4) {
    return oneDecimal;
  }
  if (twoDecimals.length >= 4) {
    return twoDecimals;
  }
  return sanitized.match(/-?\d+(?:,\d+)?/g) || [];
};

const findNumberAfterLabel = (text: string, labels: string[]) => {
  const normalizedText = normalizeText(text);
  for (const label of labels) {
    const normalizedLabel = normalizeLabel(label).replace(/\s+/g, '\\s+');
    const regex = new RegExp(
      `(?:^|\\b)${normalizedLabel}(?:\\b|$)\\s*[:\\-]?\\s*([0-9]+(?:[.,][0-9]+)?)`,
      'i'
    );
    const match = normalizedText.match(regex);
    if (match?.[1]) {
      return parseNumber(match[1]);
    }
  }
  return null;
};

const findNumberByLineProximity = (text: string, labels: string[], lookahead = 2) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalizedLabels = labels.map((label) => normalizeLabelForMatch(label));
  for (let i = 0; i < lines.length; i += 1) {
    const normalizedLine = normalizeLabelForMatch(lines[i]);
    const matched = normalizedLabels.find((label) => normalizedLine.includes(label));
    if (!matched) continue;

    const inlineNumbers = extractNumbersForRow(lines[i]);
    if (inlineNumbers.length > 0) {
      return parseNumber(inlineNumbers[inlineNumbers.length - 1]);
    }

    for (let j = 1; j <= lookahead; j += 1) {
      const candidate = lines[i + j];
      if (!candidate) continue;
      const numbers = extractNumbersForRow(candidate);
      if (numbers.length > 0) {
        return parseNumber(numbers[0]);
      }
    }
  }
  return null;
};

const extractTabularValues = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const labelMap = new Map<string, string>();
  assessmentVariableLabels.forEach((label) => {
    labelMap.set(normalizeLabelForMatch(label), label);
  });

  const variables: Record<string, number | null> = {};
  const dateRegex = /\d{2}\/\d{2}\/\d{4}/;
  const ultrasoundLabels = new Set([
    'Anteriores do Braço',
    'Posteriores do Braço',
    'Reto Femoral',
    'Vasto Intermédio',
    'Anteriores da Coxa',
    'Abdominal Superficial',
    'Abdominal Profundo',
    'Abdominal Supra Muscular Total',
    'Compartimento Anterior do Braço',
    'Compartimento Posterior do Braço',
    'Compartimento Anterior da Coxa',
  ]);
  const metabolicLabels = [
    'FC Repouso',
    'VO2máximo',
    'R. VO2máximo',
    'Limiar Anaeróbico (bpm)',
    'Limiar Anaeróbico (km/h ou watt)',
    'Limiar Anaeróbico (pace)',
    'FC Máxima Predita',
    'FC Máxima no Teste',
    'Velocidade Máxima (km/h ou watt)',
  ];
  const isSectionBreak = (value: string) => {
    const normalized = normalizeText(value).replace(/\s+/g, '').replace(/-/g, '');
    return (
      normalized.includes('relacaoabdomequadril') ||
      normalized.includes('indicesneuromusculares') ||
      normalized.includes('avaliacaometabolica') ||
      normalized.includes('composicaocorporal') ||
      normalized.includes('dadosantropometricos') ||
      normalized.includes('espessuradetecido') ||
      normalized.includes('tecidoadiposo') ||
      normalized.includes('tecidomuscular') ||
      normalized.includes('resumocapacidadesfisicas')
    );
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalizedLine = normalizeText(line);
    const compactLine = normalizedLine.replace(/\s+/g, '').replace(/-/g, '');
    const isMetabolicBlock =
      compactLine.includes('avaliacaometabolica') ||
      compactLine.includes('consumomaximodeoxigenio') ||
      compactLine.includes('vo2') ||
      normalizedLine.includes('avaliacao metabolica');
    const isVariableHeader =
      normalizedLine.includes('variavel') ||
      normalizedLine.includes('dobra cutanea') ||
      normalizedLine.includes('composicao corporal') ||
      normalizedLine.includes('ultrassom') ||
      normalizedLine.includes('espessura de tecido muscular') ||
      normalizedLine.includes('tecido adiposo') ||
      normalizedLine.includes('relacao abdome') ||
      normalizedLine.includes('indice neuromuscular') ||
      normalizedLine.includes('avaliacao metabolica') ||
      compactLine.includes('ultrassom') ||
      compactLine.includes('espessuradetecido') ||
      compactLine.includes('tecidoadiposo') ||
      compactLine.includes('relacaoabdome') ||
      compactLine.includes('indicesneuromusculares') ||
      compactLine.includes('avaliacaometabolica');
    if (!isVariableHeader) continue;

    const labels: string[] = [];
    const numericLines: string[] = [];

    let j = i + 1;
    while (j < lines.length) {
      const current = lines[j];
      if (labels.length > 0 && isSectionBreak(current)) {
        break;
      }

      const next = lines[j + 1];
      const next2 = lines[j + 2];
      if (next) {
        const combined = normalizeLabelForMatch(`${current} ${next}`);
        const mappedCombined = labelMap.get(combined);
        if (mappedCombined) {
          labels.push(mappedCombined);
          j += 2;
          continue;
        }

        if (isMetabolicBlock) {
          if (combined === 'vo 2max' || combined === 'vo2 max' || combined === 'vo2max') {
            labels.push('VO2máximo');
            j += 2;
            continue;
          }
          if (combined === 'r vo 2max' || combined === 'r vo2 max' || combined === 'r vo2max') {
            labels.push('R. VO2máximo');
            j += 2;
            continue;
          }
        }
      }

      if (next && next2) {
        const combined = normalizeLabelForMatch(`${current} ${next} ${next2}`);
        const mappedCombined = labelMap.get(combined);
        if (mappedCombined) {
          labels.push(mappedCombined);
          j += 3;
          continue;
        }
      }

      const normalized = normalizeLabelForMatch(current);
      const mapped = labelMap.get(normalized);

      if (mapped) {
        labels.push(mapped);
        j += 1;
        continue;
      }

      if (isMetabolicBlock) {
        if (normalized === 'vo' || normalized === 'vo2' || normalized === 'vo2max' || normalized === 'vo2maximo') {
          labels.push('VO2máximo');
          j += 1;
          continue;
        }
        if (normalized === 'r vo' || normalized === 'r. vo' || normalized === 'r vo2' || normalized === 'r. vo2') {
          labels.push('R. VO2máximo');
          j += 1;
          continue;
        }
        if (normalized === '2max' || normalized === '2maximo') {
          j += 1;
          continue;
        }
      }

      if (
        dateRegex.test(current) ||
        current.includes('Av') ||
        current.includes('△') ||
        current.includes('%') ||
        current.includes('Total')
      ) {
        j += 1;
        continue;
      }

      const nums = extractNumbersForRow(current);
      const hasLetters = /[a-zA-Z]/.test(current);
      if (nums.length >= 4 && !hasLetters && labels.length > 0) {
        numericLines.push(current);
        j += 1;
        break;
      }

      if (labels.length > 0 && numericLines.length === 0 && nums.length >= 4) {
        numericLines.push(current);
        j += 1;
        break;
      }

      j += 1;
    }

    if (labels.length === 0) continue;

    let k = j;
    while (k < lines.length) {
      const current = lines[k];
      if (
        current.includes('Av1Av2') ||
        current.includes('Av1Av3') ||
        current.includes('Av1Av4') ||
        current.includes('Av1Av5') ||
        current.includes('Av1Av6') ||
        current.includes('Av1Av7') ||
        current.includes('Av1Av8') ||
        current.includes('MÍN') ||
        current.includes('MÁX')
      ) {
        break;
      }
      if (isSectionBreak(current)) {
        break;
      }
      if (
        dateRegex.test(current) ||
        current.includes('Av') ||
        current.includes('△') ||
        current.includes('Total')
      ) {
        k += 1;
        continue;
      }
      const nums = extractNumbersForRow(current);
      const hasLetters = /[a-zA-Z]/.test(current);
      if (nums.length >= 4 && !hasLetters) {
        numericLines.push(current);
      }
      k += 1;
    }

    if (numericLines.length >= labels.length) {
      const aligned = numericLines.slice(-labels.length);
      labels.forEach((label, idx) => {
        if (variables[label] !== undefined) return;
        const numbers = extractNumbersForRow(aligned[idx]);
        let latest = numbers[numbers.length - 1];
        if (numbers.length >= 4) {
          latest = numbers[3];
        }
        variables[label] = parseNumber(latest);
      });
    }
  }

  const missingUltrasound = Array.from(ultrasoundLabels).some(
    (label) => variables[label] == null
  );
  if (missingUltrasound) {
    for (let i = 0; i < lines.length; i += 1) {
      const current = lines[i];
      const next = lines[i + 1];
      const combined = next ? normalizeLabelForMatch(`${current} ${next}`) : normalizeLabelForMatch(current);
      const mapped = labelMap.get(combined);
      if (!mapped || !ultrasoundLabels.has(mapped)) continue;

      const labels: string[] = [];
      const numericLines: string[] = [];
      let j = i;
      while (j < lines.length && labels.length < ultrasoundLabels.size) {
        const line = lines[j];
        const mappedLine = labelMap.get(normalizeLabelForMatch(line));
        if (mappedLine && ultrasoundLabels.has(mappedLine)) {
          labels.push(mappedLine);
          j += 1;
          continue;
        }

        const nextLine = lines[j + 1];
        if (nextLine) {
          const combinedLine = normalizeLabelForMatch(`${line} ${nextLine}`);
          const mappedCombined = labelMap.get(combinedLine);
          if (mappedCombined && ultrasoundLabels.has(mappedCombined)) {
            labels.push(mappedCombined);
            j += 2;
            continue;
          }
        }

        const next2Line = lines[j + 2];
        if (nextLine && next2Line) {
          const combinedLine = normalizeLabelForMatch(`${line} ${nextLine} ${next2Line}`);
          const mappedCombined = labelMap.get(combinedLine);
          if (mappedCombined && ultrasoundLabels.has(mappedCombined)) {
            labels.push(mappedCombined);
            j += 3;
            continue;
          }
        }

        if (
          line.includes('(mm)') ||
          line.includes('△%') ||
          line.includes('%') ||
          line.includes('Av')
        ) {
          j += 1;
          continue;
        }

        const nums = extractNumbersForRow(line);
        const hasLetters = /[a-zA-Z]/.test(line);
        if (nums.length >= 4 && !hasLetters && labels.length > 0) {
          numericLines.push(line);
          j += 1;
          break;
        }

        j += 1;
      }

      let k = j;
      while (k < lines.length && numericLines.length < labels.length) {
        const line = lines[k];
        if (
          line.includes('Av1Av2') ||
          line.includes('MÍN') ||
          line.includes('MÁX') ||
          line.includes('△%')
        ) {
          k += 1;
          continue;
        }
        const nums = extractNumbersForRow(line);
        const hasLetters = /[a-zA-Z]/.test(line);
        if (nums.length >= 4 && !hasLetters) {
          numericLines.push(line);
        }
        k += 1;
      }

      if (numericLines.length >= labels.length) {
        const aligned = numericLines.slice(-labels.length);
        labels.forEach((label, idx) => {
          if (variables[label] !== undefined) return;
          const numbers = extractNumbersForRow(aligned[idx]);
          let latest = numbers[numbers.length - 1];
          if (numbers.length >= 4) {
            latest = numbers[3];
          }
          variables[label] = parseNumber(latest);
        });
      }

      break;
    }
  }

  if (variables['Perímetro Abdominal'] == null || variables['Relação Abdome-Quadril'] == null) {
    for (let i = 0; i < lines.length; i += 1) {
      const compact = normalizeText(lines[i]).replace(/\s+/g, '').replace(/-/g, '');
      if (!compact.includes('relacaoabdomequadril')) continue;
      const numericLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const current = lines[j];
        if (isSectionBreak(current)) break;
        if (
          current.includes('Av1Av2') ||
          current.includes('△%') ||
          current.includes('MÍN') ||
          current.includes('MÁX') ||
          dateRegex.test(current)
        ) {
          j += 1;
          continue;
        }
        const nums = extractNumbersForRow(current);
        const hasLetters = /[a-zA-Z]/.test(current);
        if (nums.length >= 4 && !hasLetters) {
          numericLines.push(current);
        }
        j += 1;
      }
      if (numericLines.length >= 2) {
        const firstNumbers = extractNumbersForRow(numericLines[0]);
        const secondNumbers = extractNumbersForRow(numericLines[1]);
        if (variables['Perímetro Abdominal'] == null && firstNumbers.length >= 4) {
          variables['Perímetro Abdominal'] = parseNumber(firstNumbers[3]);
        }
        if (variables['Relação Abdome-Quadril'] == null && secondNumbers.length >= 4) {
          variables['Relação Abdome-Quadril'] = parseNumber(secondNumbers[3]);
        }
      }
      break;
    }
  }

  if (metabolicLabels.some((label) => variables[label] == null)) {
    for (let i = 0; i < lines.length; i += 1) {
      const compact = normalizeText(lines[i]).replace(/\s+/g, '').replace(/-/g, '');
      if (!compact.includes('avaliacaometabolica')) continue;
      if (compact.includes('detalhamento') || compact.includes('dadosdebase')) continue;
      const numericLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const current = lines[j];
        const compactCurrent = normalizeText(current).replace(/\s+/g, '').replace(/-/g, '');
        if (compactCurrent.includes('avaliacaometabolica') && j !== i + 1) break;
        if (compactCurrent.includes('detalhamento') || compactCurrent.includes('dadosdebase')) break;
        if (current.includes('Av1Av2') || current.includes('△%') || current.includes('MÍN') || current.includes('MÁX')) {
          j += 1;
          continue;
        }
        const nums = extractNumbersForRow(current);
        const hasLetters = /[a-zA-Z]/.test(current);
        if (nums.length >= 4 && !hasLetters) {
          numericLines.push(current);
        }
        j += 1;
      }
      if (numericLines.length >= metabolicLabels.length) {
        const aligned = numericLines.slice(-metabolicLabels.length);
        metabolicLabels.forEach((label, idx) => {
          if (variables[label] !== undefined) return;
          const numbers = extractNumbersForRow(aligned[idx]);
          if (numbers.length >= 4) {
            variables[label] = parseNumber(numbers[3]);
          }
        });
      }
      break;
    }
  }

  return variables;
};

export function parseAssessmentPdf(text: string): ParsedAssessmentData {
  const metrics: Record<string, number | null> = {
    peso: findNumberAfterLabel(text, ['peso']),
    percent_gordura: findNumberAfterLabel(text, ['% gordura', '%g', 'percent gordura', 'gordura %']),
    vo2max_ml: findNumberAfterLabel(text, ['vo2máx', 'vo2 max', 'vo2 máximo', 'vo2max']),
    vo2max_met: findNumberAfterLabel(text, ['vo2máx (met)', 'vo2max met', 'vo2 met']),
    fc_rep: findNumberAfterLabel(text, ['fc repouso', 'fc rep', 'fc repouso']),
    fc_max: findNumberAfterLabel(text, ['fc máxima', 'fc maxima', 'fc max', 'fc máxima no teste']),
    massa_magra: findNumberAfterLabel(text, ['massa magra', 'mm']),
    gordura_absoluta: findNumberAfterLabel(text, ['gordura absoluta', 'g.a', 'ga']),
    limiar_anaerobio_kmh: findNumberAfterLabel(text, [
      'lan km/h',
      'lan kmh',
      'limiar anaerobico km/h',
      'limiar anaeróbico km/h',
      'limiar anaerobico (km/h ou watt)',
      'limiar anaeróbico (km/h ou watt)',
    ]),
    limiar_anaerobio_fc: findNumberAfterLabel(text, [
      'lan fc',
      'limiar anaerobico bpm',
      'limiar anaeróbico bpm',
      'limiar anaerobico (bpm)',
      'limiar anaeróbico (bpm)',
    ]),
    tmb_dia: findNumberAfterLabel(text, ['tmb/dia', 'tmb dia']),
    cit_med_ant: findNumberAfterLabel(text, ['cit med ant', 'cit méd ant', 'cit médio anterior']),
  };

  if (metrics.vo2max_ml === null) {
    const vo2Regex = /vo2[^0-9]{0,10}([0-9]+[.,][0-9]+)/i;
    const vo2Match = text.match(vo2Regex);
    if (vo2Match?.[1]) {
      metrics.vo2max_ml = parseNumber(vo2Match[1]);
    } else {
      metrics.vo2max_ml = findNumberByLineProximity(text, [
        'vo2 máx',
        'vo2 max',
        'vo2 máximo',
        'vo2',
        'vo2máx',
      ]);
    }
  }
  if (metrics.fc_max === null) {
    const fcMaxRegex = /fc\s*m[áa]x(?:ima)?[^0-9]{0,10}([0-9]{2,3})/i;
    const fcMaxMatch = text.match(fcMaxRegex);
    if (fcMaxMatch?.[1]) {
      const value = parseNumber(fcMaxMatch[1]);
      metrics.fc_max = value !== null && value >= 80 && value <= 230 ? value : null;
    } else {
      const value = findNumberByLineProximity(text, [
        'fc máx',
        'fc maxima',
        'fc max',
        'fc máxima',
      ]);
      metrics.fc_max = value !== null && value >= 80 && value <= 230 ? value : null;
    }
  }
  if (metrics.fc_rep === null) {
    const fcRepRegex = /fc\s*repouso[^0-9]{0,10}([0-9]{2,3})/i;
    const fcRepMatch = text.match(fcRepRegex);
    if (fcRepMatch?.[1]) {
      const value = parseNumber(fcRepMatch[1]);
      metrics.fc_rep = value !== null && value >= 30 && value <= 120 ? value : null;
    } else {
      const value = findNumberByLineProximity(text, ['fc repouso', 'fc rep']);
      metrics.fc_rep = value !== null && value >= 30 && value <= 120 ? value : null;
    }
  }

  if (metrics.fc_max !== null && (metrics.fc_max < 80 || metrics.fc_max > 230)) {
    metrics.fc_max = null;
  }
  if (metrics.fc_rep !== null && (metrics.fc_rep < 30 || metrics.fc_rep > 120)) {
    metrics.fc_rep = null;
  }

  const variables: Record<string, number | null> = extractTabularValues(text);
  for (const variable of assessmentVariableLabels) {
    if (variables[variable] !== undefined) continue;
    const value = findNumberAfterLabel(text, [variable]);
    if (value !== null) {
      variables[variable] = value;
    }
  }

  if (metrics.peso === null && variables['Peso'] !== undefined) {
    metrics.peso = variables['Peso'];
  }
  if (metrics.percent_gordura === null && variables['% Gordura'] !== undefined) {
    metrics.percent_gordura = variables['% Gordura'];
  }
  if (metrics.massa_magra === null && variables['Massa Magra'] !== undefined) {
    metrics.massa_magra = variables['Massa Magra'];
  }
  if (metrics.gordura_absoluta === null && variables['Gordura Absoluta'] !== undefined) {
    metrics.gordura_absoluta = variables['Gordura Absoluta'];
  }
  if (metrics.vo2max_ml === null && variables['VO2máximo'] !== undefined) {
    metrics.vo2max_ml = variables['VO2máximo'];
  }

  const fcMaxFromText = findNumberByLineProximity(text, ['fc máx', 'fc máx.', 'fc máxima', 'fc max']);
  if (metrics.fc_max === null && fcMaxFromText !== null && fcMaxFromText >= 80 && fcMaxFromText <= 230) {
    metrics.fc_max = fcMaxFromText;
  }

  const fcLimFromText = findNumberByLineProximity(text, ['fc limiar']);
  const cargaLimiarFromText = findNumberByLineProximity(text, ['carga limiar']);
  const cargaMaxFromText = findNumberByLineProximity(text, ['carga máx', 'carga max', 'vam']);

  if (variables['VO2máximo'] == null && metrics.vo2max_ml != null) {
    variables['VO2máximo'] = metrics.vo2max_ml;
  }
  if (variables['Limiar Anaeróbico (bpm)'] == null && fcLimFromText != null) {
    variables['Limiar Anaeróbico (bpm)'] = fcLimFromText;
  }
  if (variables['Limiar Anaeróbico (km/h ou watt)'] == null && cargaLimiarFromText != null) {
    variables['Limiar Anaeróbico (km/h ou watt)'] = cargaLimiarFromText;
  }
  if (variables['Velocidade Máxima (km/h ou watt)'] == null && cargaMaxFromText != null) {
    variables['Velocidade Máxima (km/h ou watt)'] = cargaMaxFromText;
  }
  if (variables['FC Máxima no Teste'] == null && metrics.fc_max != null) {
    variables['FC Máxima no Teste'] = metrics.fc_max;
  }

  return { metrics, variables };
}
