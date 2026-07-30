import { WORKBOOK_CAPACITY_CATALOG_ITEMS } from './capacity-prescription-workbook-catalog.js';

describe('capacity prescription workbook catalog', () => {
  it('preserva as siglas musculares da aba Siglas e ambiente', () => {
    const muscleCodes = WORKBOOK_CAPACITY_CATALOG_ITEMS
      .filter((item) => item.category === 'muscle_group')
      .map((item) => item.code);

    expect(muscleCodes).toEqual([
      'PT',
      'TB',
      'DR',
      'BB',
      'DA',
      'DM',
      'DP',
      'TP',
      'GM',
      'AQ',
      'AD',
      'QD',
      'PC',
      'ABS',
      'AO',
      'LEC',
      'TS',
      'MR',
      'FP',
      'EP',
      'TA',
      'G1',
      'G2',
    ]);
  });

  it('preserva ambiente, estímulos cíclicos e movimentos da planilha', () => {
    expect(
      WORKBOOK_CAPACITY_CATALOG_ITEMS
        .filter((item) => item.category === 'environment')
        .map((item) => item.code)
    ).toEqual(['BOSFIT']);

    expect(
      WORKBOOK_CAPACITY_CATALOG_ITEMS
        .filter((item) => item.category === 'cyclic_stimulus')
        .map((item) => item.code)
    ).toEqual(['CEXT', 'CINT', 'IEXT', 'IINT', 'FLEK']);

    expect(
      WORKBOOK_CAPACITY_CATALOG_ITEMS
        .filter((item) => item.category === 'acronym')
        .map((item) => item.code)
    ).toEqual([
      'FLQ',
      'EXQ',
      'ABQ',
      'REQ',
      'AHO',
      'FLC',
      'DSF',
      'MA1',
      'MA2',
      'MA3',
      'MA4',
      'MA5',
    ]);
  });

  it('preserva os 39 seletores da coluna Exercícios com provenance', () => {
    const exercises = WORKBOOK_CAPACITY_CATALOG_ITEMS.filter(
      (item) => item.category === 'exercise'
    );

    expect(exercises).toHaveLength(39);
    expect(exercises.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'AbQ',
        'ABS + AO',
        'BB + DM + TP',
        'DR + BB + DP',
        'GM + QD',
        'PT + TB + DA',
        'TB + BB + DA + DM + TP + MR',
        'Outros',
      ])
    );
    expect(exercises.every((item) => item.metadata?.sourceSection === 'Exercícios')).toBe(true);
  });

  it('inclui dedos no catálogo mínimo de flexibilidade', () => {
    expect(WORKBOOK_CAPACITY_CATALOG_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'articulation',
          code: 'DEDOS',
          name: 'Dedos',
        }),
      ])
    );
  });

  it('não possui chaves duplicadas por categoria e código', () => {
    const keys = WORKBOOK_CAPACITY_CATALOG_ITEMS.map(
      (item) => `${item.category}:${item.code}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
