const CP850_PT_BR_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
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
  '\u00a0': 'á',
  '\u00a1': 'í',
  '\u00a2': 'ó',
  '\u00a3': 'ú',
  '\u00b5': 'Á',
  '\u00b6': 'Â',
  '\u00b7': 'À',
  '\u00c6': 'ã',
  '\u00c7': 'Ã',
  '\u00d2': 'Ê',
  '\u00d3': 'Ë',
  '\u00d4': 'È',
  '\u00d6': 'Í',
  '\u00d7': 'Î',
  '\u00d8': 'Ï',
  '\u00de': 'Ì',
});

// O catálogo legado foi exportado em CP850 e parte dos bytes foi interpretada
// como Latin-1/Windows-1252 antes de ser salva em UTF-8. Somente codepoints que
// funcionam como marcadores inequívocos de mojibake são convertidos. Codepoints
// que também representam acentos pt-BR válidos (como é/ã) ficam intactos.
const CP850_MOJIBAKE_MARKER = /[\u0080-\u009f\u00a0-\u00a3\u00b5-\u00b7\u00c6\u00c7\u00d2-\u00d4\u00d6-\u00d8\u00de]/;

export function repairPtBrMojibake(value: string): string {
  if (!value || !CP850_MOJIBAKE_MARKER.test(value)) {
    return value;
  }

  return Array.from(value, (character) => {
    if (!CP850_MOJIBAKE_MARKER.test(character)) {
      return character;
    }

    return CP850_PT_BR_REPLACEMENTS[character] ?? character;
  }).join('');
}
