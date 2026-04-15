export interface ParsedAssessmentData {
  metrics: Record<string, number | null>;
  variables: Record<string, number | string | null>;
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
  'VAM (km/h)',
  'Carga Limiar (km/h)',
  'Velocidade Máxima (km/h ou watt)',
  'FC Máxima Predita',
  'FC Máxima no Teste',
  'Diferença % em relação à necessidade estimada',
  'Tipo de Dieta',
  'Disponibilidade Energética',
  'Aporte energético Diário Sugerido',
  'Diferença Absoluta Necessidade vs Consumo',
  'Diferença Percentual Necessidade vs Consumo',
  'Proteínas (g/kg)',
  'Carboidratos (g/kg)',
  'Lipídios (g/kg)',
  'Proteínas (g/dia)',
  'Carboidratos (g/dia)',
  'Lipídios (g/dia)',
  'Proteínas (kcal/dia)',
  'Carboidratos (kcal/dia)',
  'Lipídios (kcal/dia)',
  'Proteínas (%)',
  'Carboidratos (%)',
  'Lipídios (%)',
  'Total de Kcal/dia',
  'Variação de Redução de Gordura Estimada',
  'Variação de Redução 1kg de gordura',
  'Variação da meta proposta (-0,1kg)',
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
  const twoCommaMatch = compact.match(/^(-?\d{1,3},\d)(\d{2,3},\d)$/);
  if (twoCommaMatch) {
    return [twoCommaMatch[1], twoCommaMatch[2]];
  }
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
  if (/^\d{6,}$/.test(compact)) {
    const chunks: string[] = [];
    for (let i = 0; i < compact.length; i += 2) {
      chunks.push(compact.slice(i, i + 2));
    }
    if (chunks.length >= 4) {
      return chunks;
    }
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

const findNumberByFollowingNumericLine = (text: string, labels: string[], lookahead = 120) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalizedLabels = labels.map((label) => normalizeLabelForMatch(label));
  for (let i = 0; i < lines.length; i += 1) {
    const normalizedLine = normalizeLabelForMatch(lines[i]);
    const matched = normalizedLabels.find((label) => normalizedLine.includes(label));
    if (!matched) continue;
    for (let j = 1; j <= lookahead; j += 1) {
      const candidate = lines[i + j];
      if (!candidate) continue;
      const nums = extractNumbersForRow(candidate);
      const hasLetters = /[a-zA-Z]/.test(candidate);
      if (nums.length >= 4 && !hasLetters) {
        return parseNumber(nums[0]);
      }
    }
  }
  return null;
};

const findIntegerByFollowingNumericLine = (
  text: string,
  labels: string[],
  lookahead = 120,
  min = 30,
  max = 120
) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalizedLabels = labels.map((label) => normalizeLabelForMatch(label));
  for (let i = 0; i < lines.length; i += 1) {
    const normalizedLine = normalizeLabelForMatch(lines[i]);
    const matched = normalizedLabels.find((label) => normalizedLine.includes(label));
    if (!matched) continue;
    for (let j = 1; j <= lookahead; j += 1) {
      const candidate = lines[i + j];
      if (!candidate) continue;
      const nums = extractNumbersForRow(candidate);
      const hasLetters = /[a-zA-Z]/.test(candidate);
      if (nums.length >= 4 && !hasLetters) {
        const parsed = parseNumber(nums[0]);
        if (parsed !== null && Number.isInteger(parsed) && parsed >= min && parsed <= max) {
          return parsed;
        }
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
      normalizedLine.includes('aporte energetico') ||
      compactLine.includes('ultrassom') ||
      compactLine.includes('espessuradetecido') ||
      compactLine.includes('tecidoadiposo') ||
      compactLine.includes('relacaoabdome') ||
      compactLine.includes('indicesneuromusculares') ||
      compactLine.includes('avaliacaometabolica') ||
      compactLine.includes('aporteenergetico');
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

const aporteEnergeticoVariables = [
  'Diferença % em relação à necessidade estimada',
  'Tipo de Dieta',
  'Disponibilidade Energética',
  'Aporte energético Diário Sugerido',
  'Diferença Absoluta Necessidade vs Consumo',
  'Diferença Percentual Necessidade vs Consumo',
  'Proteínas (g/kg)',
  'Carboidratos (g/kg)',
  'Lipídios (g/kg)',
  'Proteínas (g/dia)',
  'Carboidratos (g/dia)',
  'Lipídios (g/dia)',
  'Proteínas (kcal/dia)',
  'Carboidratos (kcal/dia)',
  'Lipídios (kcal/dia)',
  'Proteínas (%)',
  'Carboidratos (%)',
  'Lipídios (%)',
  'Total de Kcal/dia',
  'Variação de Redução de Gordura Estimada',
  'Variação de Redução 1kg de gordura',
  'Variação da meta proposta (-0,1kg)',
];

const extractAporteEnergetico = (text: string, variables: Record<string, number | string | null>) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = lines.map((line) => normalizeText(line).replace(/\s+/g, '').replace(/-/g, ''));
  const startIndex = normalized.findIndex((line) => line.includes('aporteenergetico'));
  if (startIndex < 0) return;
  const endIndex = normalized.findIndex(
    (line, idx) => idx > startIndex && line.includes('distribuicaoporrefeicao')
  );
  const slice = lines.slice(startIndex, endIndex > 0 ? endIndex : startIndex + 160);
  const sliceNormalized = slice.map((line) => normalizeLabelForMatch(line));

  const findNumericAfterLabel = (labels: string[], numericRegex: RegExp, lookahead = 20) => {
    const normalizedLabels = labels.map((label) => normalizeLabelForMatch(label));
    for (let i = 0; i < slice.length; i += 1) {
      const current = sliceNormalized[i];
      if (!normalizedLabels.some((label) => current.includes(label))) continue;
      for (let j = 1; j <= lookahead; j += 1) {
        const candidate = slice[i + j];
        if (!candidate) continue;
        const match = candidate.match(numericRegex);
        if (match?.[0]) {
          return parseNumber(match[0]);
        }
      }
    }
    return null;
  };

  const findStandaloneNumberAfterLabel = (labels: string[], numericRegex: RegExp, lookahead = 40) => {
    const normalizedLabels = labels.map((label) => normalizeLabelForMatch(label));
    for (let i = 0; i < slice.length; i += 1) {
      const current = sliceNormalized[i];
      if (!normalizedLabels.some((label) => current.includes(label))) continue;
      for (let j = 1; j <= lookahead; j += 1) {
        const candidate = slice[i + j];
        if (!candidate) continue;
        const trimmed = candidate.replace(/\s+/g, '');
        if (!numericRegex.test(trimmed)) continue;
        return parseNumber(trimmed);
      }
    }
    return null;
  };

  if (variables['Tipo de Dieta'] == null) {
    const dietWords = ['isocalorica', 'hipocalorica', 'hipercalorica', 'normocalorica'];
    const dietLine = slice.find((line) =>
      dietWords.some((word) => normalizeText(line).includes(word))
    );
    if (dietLine) {
      const value = dietLine.replace(/\d.+$/, '').trim();
      if (value) variables['Tipo de Dieta'] = value;
    }
  }

  if (variables['DiferenÃ§a Absoluta Necessidade vs Consumo'] == null) {
    const value = findNumericAfterLabel(
      ['DiferenÃ§a Absoluta Necessidade vs Consumo', 'DiferenÃ§a Absoluta'],
      /-?\d{2,4},\d/
    );
    if (value != null) variables['DiferenÃ§a Absoluta Necessidade vs Consumo'] = value;
  }

  if (variables['DiferenÃ§a Percentual Necessidade vs Consumo'] == null) {
    const value = findNumericAfterLabel(
      ['DiferenÃ§a Percentual Necessidade vs Consumo', 'DiferenÃ§a Percentual'],
      /-?\d{1,3},\d/
    );
    if (value != null) variables['DiferenÃ§a Percentual Necessidade vs Consumo'] = value;
  }

  const macroIndex = sliceNormalized.findIndex((line) =>
    line.includes('proteinascarboidratoslipidios')
  );
  if (macroIndex >= 0) {
    if (variables['Diferença % em relação à necessidade estimada'] == null) {
      const percentMatches = slice
        .slice(0, macroIndex + 10)
        .flatMap((line) => Array.from(line.matchAll(/-?\d{1,3},\d%/g)).map((m) => m[0]))
        .map((value) => parseNumber(value.replace('%', '')))
        .filter((value): value is number => value !== null);
      const smallPercent = percentMatches.find((value) => value <= 20);
      if (smallPercent != null) {
        variables['Diferença % em relação à necessidade estimada'] = smallPercent;
      } else if (percentMatches.length > 0) {
        variables['Diferença % em relação à necessidade estimada'] = percentMatches[0];
      }
    }

    const dietWords = ['isocalorica', 'hipocalorica', 'hipercalorica', 'normocalorica'];
    const rowLines = slice.filter((line) => {
      if (!line.includes(',')) return false;
      if (normalizeText(line).includes('dias')) return false;
      const nums = extractNumbersForRow(line);
      if (nums.length !== 4) return false;
      const last = parseNumber(nums[3]);
      return last != null && last >= 0 && last <= 100;
    });

    const assignRow = (rowType: 'Proteínas' | 'Carboidratos' | 'Lipídios', nums: string[]) => {
      const values = nums.slice(0, 4).map((value) => parseNumber(value));
      if (values[0] != null) variables[`${rowType} (g/kg)`] = values[0];
      if (values[1] != null) variables[`${rowType} (g/dia)`] = values[1];
      if (values[2] != null) variables[`${rowType} (kcal/dia)`] = values[2];
      if (values[3] != null) variables[`${rowType} (%)`] = values[3];
    };

    let proteinSet = false;
    let carbSet = false;
    let fatSet = false;

    rowLines.forEach((line) => {
      const nums = extractNumbersForRow(line);
      if (nums.length < 4) return;
      const normalizedLine = normalizeText(line);
      if (!fatSet && dietWords.some((word) => normalizedLine.includes(word))) {
        if (variables['Tipo de Dieta'] == null) {
          const value = line.replace(/\d.+$/, '').trim();
          if (value) variables['Tipo de Dieta'] = value;
        }
        assignRow('Lipídios', nums);
        fatSet = true;
        return;
      }
      if (!proteinSet) {
        assignRow('Proteínas', nums);
        proteinSet = true;
        return;
      }
      if (!carbSet) {
        assignRow('Carboidratos', nums);
        carbSet = true;
        return;
      }
      if (!fatSet) {
        assignRow('Lipídios', nums);
        fatSet = true;
      }
    });
  }

  if (variables['Total de Kcal/dia'] == null) {
    const totalKcal = findStandaloneNumberAfterLabel(['Total de Kcal/dia'], /^-?\d{3,4},\d$/);
    if (totalKcal != null) variables['Total de Kcal/dia'] = totalKcal;
  }

  if (variables['Aporte energético Diário Sugerido'] == null) {
    const aporteKcal = findStandaloneNumberAfterLabel(
      ['Aporte energético Diário', 'Aporte energético Diário Sugerido'],
      /^-?\d{3,4},\d$/
    );
    if (aporteKcal != null) variables['Aporte energético Diário Sugerido'] = aporteKcal;
  }

  if (variables['Disponibilidade Energética'] == null) {
    let idx = sliceNormalized.findIndex((line) => line.includes('disponibilidadeenergetica'));
    if (idx < 0) {
      idx = sliceNormalized.findIndex((line, i) => {
        const next = sliceNormalized[i + 1];
        return line === 'disponibilidade' && next === 'energetica';
      });
    }
    if (idx >= 0) {
      for (let i = idx + 1; i < Math.min(slice.length, idx + 20); i += 1) {
        const line = slice[i];
        if (/[A-Za-z]/.test(line)) continue;
        if (!line.includes(',')) continue;
        const compact = line.replace(/\s+/g, '');
        let rawNumbers = compact.match(/-?\d{1,3},\d/g) || [];
        if (rawNumbers.length < 2) {
          const splitMatch = compact.match(/(-?\d{1,3},\d)(\d{2,3},\d)/);
          if (splitMatch) {
            rawNumbers = [splitMatch[1], splitMatch[2]];
          }
        }
        const nums = rawNumbers
          .map((value) => parseNumber(value))
          .filter((value): value is number => value !== null);
        if (nums.length === 2) {
          const filtered = nums.filter((value) => value >= 20 && value <= 500);
          variables['Disponibilidade Energética'] = filtered.length > 0 ? Math.max(...filtered) : Math.max(...nums);
          break;
        }
      }
    }
  }

  // Demais campos ficam para o preenchimento via IA quando necessÃ¡rio.
};

const extractProtocolText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = lines.map((line) => normalizeText(line));
  const stopWords = ['bpm', 'ml/kg/min', 'km/h', 'watt', 'pace', 'fc', 'limiar', 'predita', 'maxima', 'av'];
  const preferWords = ['teste', 'esteira', 'bicicleta', 'ciclismo', 'ergometrico', 'ergométrico'];

  for (let i = 0; i < lines.length; i += 1) {
    if (normalized[i] !== 'teste de') continue;
    const next = normalized[i + 1];
    if (!next) continue;
    const next2 = normalized[i + 2];
    const next3 = normalized[i + 3];
    const hasEsteira = next.includes('esteira') || next2?.includes('esteira') || next3?.includes('esteira');
    const hasProgressiva =
      next.includes('progressiva') || next2?.includes('progressiva') || next3?.includes('progressiva');
    if (hasEsteira && hasProgressiva) {
      const parts = ['Teste de'];
      if (next) parts.push(lines[i + 1]);
      if (next2) parts.push(lines[i + 2]);
      if (next3 && normalizeText(lines[i + 3]).includes('progressiva')) parts.push(lines[i + 3]);
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }
  }

  let best: { value: string; priority: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    if (!normalized[i].includes('protocolo')) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 10); j += 1) {
      const current = lines[j];
      const normalizedLine = normalized[j];
      if (!normalizedLine) continue;
      if (/\d/.test(current)) continue;
      if (normalizedLine.includes('protocolo')) continue;
      if (stopWords.some((word) => normalizedLine.includes(word))) break;
      if (normalizedLine.length < 2) continue;
      if (normalizedLine.includes('assessoria')) continue;

      const parts = [current];
      const shouldAppend = (value: string, normalizedValue: string) => {
        if (!value) return false;
        if (/\d/.test(value)) return false;
        if (normalizedValue.includes('assessoria')) return false;
        if (normalizedValue.includes('academia')) return false;
        if (value.includes('/') || value.includes('|')) return false;
        if (value.length > 24) return false;
        return !stopWords.some((word) => normalizedValue.includes(word));
      };

      const next = lines[j + 1];
      const nextNorm = normalized[j + 1];
      if (next && nextNorm && shouldAppend(next, nextNorm)) {
        parts.push(next);
        const next2 = lines[j + 2];
        const next2Norm = normalized[j + 2];
        if (next2 && next2Norm && shouldAppend(next2, next2Norm)) {
          parts.push(next2);
        }
      }

      const phrase = parts.join(' ').replace(/\s+/g, ' ').trim();
      const normalizedPhrase = normalizeText(phrase);
      const priority = preferWords.some((word) => normalizedPhrase.includes(word)) ? 2 : 1;
      if (!best || priority > best.priority) {
        best = { value: phrase, priority };
      }
      if (priority === 2) return best.value;
    }
  }

  return best?.value ?? null;
};

const extractRVo2MaxText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = lines.map((line) => normalizeText(line));
  const startIndex = normalized.findIndex((line) => line.includes('teste de consumo'));
  const slice = lines.slice(startIndex >= 0 ? startIndex : 0, startIndex >= 0 ? startIndex + 160 : lines.length);

  const ratingRegex = /(Superior|Excelente|Boa|Média|Médio|Media|Fraca)/gi;
  let bestMatch: { value: string; count: number } | null = null;

  slice.forEach((line) => {
    const normalizedLine = normalizeText(line);
    if (normalizedLine.includes('vo2max')) return;
    const matches = Array.from(line.matchAll(ratingRegex)).map((match) => match[0]);
    if (matches.length === 0) return;
    const last = matches[matches.length - 1];
    const value = last.replace(/media/i, 'Média').replace(/médio/i, 'Médio').trim();
    if (!value) return;
    if (!bestMatch || matches.length > bestMatch.count) {
      bestMatch = { value, count: matches.length };
    }
  });

  return (bestMatch as { value: string; count: number } | null)?.value ?? null;
};

const getNumericVariable = (
  variables: Record<string, number | string | null>,
  key: string
): number | null => {
  const value = variables[key];
  return typeof value === 'number' ? value : null;
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
      if (metrics.fc_rep === null) {
        const fallback = findIntegerByFollowingNumericLine(text, ['fc repouso'], 120, 30, 120);
        metrics.fc_rep = fallback !== null ? fallback : null;
      }
    }
  }

  if (metrics.fc_max !== null && (metrics.fc_max < 80 || metrics.fc_max > 230)) {
    metrics.fc_max = null;
  }
  if (metrics.fc_rep !== null && (metrics.fc_rep < 30 || metrics.fc_rep > 120)) {
    metrics.fc_rep = null;
  }

  const variables: Record<string, any> = extractTabularValues(text);
  aporteEnergeticoVariables.forEach((label) => {
    variables[label] = null;
  });
  extractAporteEnergetico(text, variables);
  for (const variable of assessmentVariableLabels) {
    if (variables[variable] !== undefined) continue;
    const value = findNumberAfterLabel(text, [variable]);
    if (value !== null) {
      variables[variable] = value;
    }
  }

  if (metrics.peso === null) {
    metrics.peso = getNumericVariable(variables, 'Peso');
  }
  if (metrics.percent_gordura === null) {
    metrics.percent_gordura = getNumericVariable(variables, '% Gordura');
  }
  if (metrics.massa_magra === null) {
    metrics.massa_magra = getNumericVariable(variables, 'Massa Magra');
  }
  if (metrics.gordura_absoluta === null) {
    metrics.gordura_absoluta = getNumericVariable(variables, 'Gordura Absoluta');
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
  const cargaMaxFromText = findNumberByLineProximity(text, ['carga máx', 'carga max']);
  const vamFromText = findNumberByLineProximity(text, ['vam']);

  if (variables['VO2máximo'] == null && metrics.vo2max_ml != null) {
    variables['VO2máximo'] = metrics.vo2max_ml;
  }
  if (variables['Limiar Anaeróbico (bpm)'] == null && fcLimFromText != null) {
    variables['Limiar Anaeróbico (bpm)'] = fcLimFromText;
  }
  if (variables['Limiar Anaeróbico (km/h ou watt)'] == null && cargaLimiarFromText != null) {
    variables['Limiar Anaeróbico (km/h ou watt)'] = cargaLimiarFromText;
  }
  if (variables['Carga Limiar (km/h)'] == null && cargaLimiarFromText != null) {
    variables['Carga Limiar (km/h)'] = cargaLimiarFromText;
  }
  if (variables['Velocidade Máxima (km/h ou watt)'] == null && cargaMaxFromText != null) {
    variables['Velocidade Máxima (km/h ou watt)'] = cargaMaxFromText;
  }
  if (variables['VAM (km/h)'] == null && vamFromText != null) {
    variables['VAM (km/h)'] = vamFromText;
  }
  if (variables['FC Máxima no Teste'] == null && metrics.fc_max != null) {
    variables['FC Máxima no Teste'] = metrics.fc_max;
  }
  if (variables['FC Repouso'] == null && metrics.fc_rep != null) {
    variables['FC Repouso'] = metrics.fc_rep;
  }

  if (variables['Protocolo'] == null) {
    const protocolText = extractProtocolText(text);
    if (protocolText) {
      variables['Protocolo'] = protocolText;
    }
  }

  if (variables['R. VO2mÃ¡ximo'] == null && (variables['R. VO2máximo'] == null || variables['R. VO2máximo'] === '')) {
    const rVo2Text = extractRVo2MaxText(text);
    if (rVo2Text) {
      variables['R. VO2mÃ¡ximo'] = rVo2Text;
      variables['R. VO2máximo'] = rVo2Text;
    }
  }

  return { metrics, variables };
}
