import { assertStudentInterestServiceSelectable } from './aluno.service-selection.js';

describe('student interest service selection', () => {
  it('permite novo vínculo somente com serviço principal ativo', () => {
    expect(() =>
      assertStudentInterestServiceSelectable(
        { id: 'active', isActive: true, parentServiceId: null },
        null
      )
    ).not.toThrow();
    expect(() =>
      assertStudentInterestServiceSelectable({ id: 'inactive', isActive: false, parentServiceId: null })
    ).toThrow('inativo');
    expect(() =>
      assertStudentInterestServiceSelectable({ id: 'option', isActive: true, parentServiceId: 'base' })
    ).toThrow('serviço principal');
  });

  it('preserva o vínculo atual mesmo quando ficou inativo ou é legado', () => {
    expect(() =>
      assertStudentInterestServiceSelectable(
        { id: 'legacy', isActive: false, parentServiceId: 'old-base' },
        'legacy'
      )
    ).not.toThrow();
  });

  it('não permite trocar para outro serviço indisponível', () => {
    expect(() =>
      assertStudentInterestServiceSelectable(
        { id: 'inactive', isActive: false, parentServiceId: null },
        'current'
      )
    ).toThrow('inativo');
  });
});
