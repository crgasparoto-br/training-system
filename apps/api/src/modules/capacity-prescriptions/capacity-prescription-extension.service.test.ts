import { EXTENDED_CAPACITY_PARAMETER_SETS } from './capacity-prescription-extension.service.js';

describe('capacity prescription spreadsheet coverage', () => {
  it('mantém os quatro códigos de carga de microciclo da planilha', () => {
    const codes = EXTENDED_CAPACITY_PARAMETER_SETS.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['ADP', 'ORD', 'CHO', 'REG']));
  });

  it('mantém parâmetros iniciais para as quatro capacidades', () => {
    const capacities = new Set(EXTENDED_CAPACITY_PARAMETER_SETS.map((item) => item.capacity));
    expect(capacities).toEqual(new Set(['resisted', 'cyclic', 'flexibility', 'balance']));
  });

  it('preserva estímulos contínuo e intervalado como valores distintos', () => {
    const cyclic = EXTENDED_CAPACITY_PARAMETER_SETS.filter((item) => item.capacity === 'cyclic');
    expect(cyclic.map((item) => item.code)).toEqual(
      expect.arrayContaining(['CYCLIC_CONTINUOUS', 'CYCLIC_INTERVAL'])
    );
  });
});
