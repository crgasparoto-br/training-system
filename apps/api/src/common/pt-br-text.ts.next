const CP850_C1_PT_BR_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  '\u0080': 'Ç',
  '\u0081': 'ü',
  '\u0082': 'é',
  '\u0083': 'â',
  '\u0084': 'ä',
  '\u0085': 'à',
  '\u0087': 'ç',
  '\u0088': 'ê',
  '\u0089': 'ë',
  '\u008a': 'è',
  '\u008b': 'ï',
  '\u008c': 'î',
  '\u008d': 'ì',
  '\u008e': 'Ä',
  '\u0090': 'É',
  '\u0093': 'ô',
  '\u0094': 'ö',
  '\u0095': 'ò',
  '\u0096': 'û',
  '\u0097': 'ù',
  '\u0099': 'Ö',
  '\u009a': 'Ü',
});

const LEGACY_PT_BR_FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['çÆ', 'ção'],
  ['CÆo', 'Cão'],
  ['cÆo', 'cão'],
  ['DorsiflexÆo', 'Dorsiflexão'],
  ['FlexÆo', 'Flexão'],
  ['flexÆo', 'flexão'],
  ['ExtensÆo', 'Extensão'],
  ['impulsÆo', 'impulsão'],
  ['B£lgaro', 'Búlgaro'],
  ['S¢leo', 'Sóleo'],
  ['C¢coras', 'Cócoras'],
  ['N¢rdica', 'Nórdica'],
  ['Equil¡brio', 'Equilíbrio'],
  ['Tr¡ceps', 'Tríceps'],
  ['n¡vel', 'nível'],
  ['poss¡vel', 'possível'],
  ['M\u00a0quina', 'Máquina'],
  ['m\u00a0quina', 'máquina'],
  ['El\u00a0stico', 'Elástico'],
  ['el\u00a0stico', 'elástico'],
  ['Tor\u00a0cica', 'Torácica'],
  ['esc\u00a0pula', 'escápula'],
  ['r\u00a0pido', 'rápido'],
];

// O catálogo legado foi exportado em CP850 e parte dos bytes foi interpretada
// como Latin-1/Windows-1252 antes de ser salva em UTF-8. Caracteres C1 são
// marcadores inequívocos; bytes visíveis ambíguos só são corrigidos em fragmentos
// legados conhecidos, preservando Unicode pt-BR válido e NBSP legítimo.
export function repairPtBrMojibake(value: string): string {
  if (!value) {
    return value;
  }

  const repairedControls = Array.from(
    value,
    (character) => CP850_C1_PT_BR_REPLACEMENTS[character] ?? character,
  ).join('');

  return LEGACY_PT_BR_FRAGMENTS.reduce(
    (text, [source, target]) => text.split(source).join(target),
    repairedControls,
  );
}
