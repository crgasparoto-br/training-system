import type { ServiceCommercialOption } from '@corrida/types';
import {
  assertCompleteReorder,
  assertPriceRule,
  assertValidity,
  isPlanComponentCommerciallyActive,
  resolveCommercialState,
  wouldCreateServiceCycle,
} from './service.domain.js';

const option = (overrides: Partial<ServiceCommercialOption> = {}): ServiceCommercialOption => ({
  id: 'option-1',
  contractId: 'contract-1',
  serviceId: 'service-1',
  code: 'option_1',
  name: 'Opção 1',
  priceType: 'fixed',
  priceAmount: 100,
  validFrom: null,
  validUntil: null,
  isActive: true,
  displayOrder: 0,
  origin: 'manual',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  ...overrides,
});

describe('service catalog domain', () => {
  it('valida os três tipos de preço', () => {
    expect(() => assertPriceRule('fixed', 120)).not.toThrow();
    expect(() => assertPriceRule('fixed', 0)).toThrow('maior que zero');
    expect(() => assertPriceRule('free', null)).not.toThrow();
    expect(() => assertPriceRule('free', 10)).toThrow('não devem possuir valor');
    expect(() => assertPriceRule('on_request', undefined)).not.toThrow();
  });

  it('rejeita vigência final anterior à inicial', () => {
    expect(() =>
      assertValidity(new Date('2026-07-11T00:00:00.000Z'), new Date('2026-07-10T00:00:00.000Z'))
    ).toThrow('data final');
  });

  it('calcula preço inicial somente com opções ativas e vigentes', () => {
    const result = resolveCommercialState(
      'individual_service',
      [
        option({ id: 'expired', priceAmount: 50, validUntil: '2026-01-01T00:00:00.000Z' }),
        option({ id: 'current', priceAmount: 125 }),
        option({ id: 'inactive', priceAmount: 80, isActive: false }),
      ],
      0,
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toEqual({ state: 'available', startingPrice: 125, priceLabel: 'A partir de' });
  });

  it('diferencia gratuito, sob consulta, vencido e plano incompleto', () => {
    expect(resolveCommercialState('assessment', [option({ priceType: 'free', priceAmount: null })], 0).state).toBe('free');
    expect(resolveCommercialState('assessment', [option({ priceType: 'on_request', priceAmount: null })], 0).state).toBe('on_request');
    expect(
      resolveCommercialState(
        'individual_service',
        [option({ validUntil: '2020-01-01T00:00:00.000Z' })],
        0,
        new Date('2026-07-10T00:00:00.000Z')
      ).state
    ).toBe('expired');
    expect(resolveCommercialState('combined_plan', [option()], 0).state).toBe('incomplete_plan');
  });

  it('considera ativo apenas componente e destino ativos', () => {
    expect(
      isPlanComponentCommerciallyActive({
        isActive: true,
        targetServiceId: 'service-1',
        targetServiceActive: true,
      })
    ).toBe(true);
    expect(
      isPlanComponentCommerciallyActive({
        isActive: true,
        targetServiceId: 'service-1',
        targetServiceActive: false,
      })
    ).toBe(false);
    expect(
      isPlanComponentCommerciallyActive({
        isActive: true,
        targetOptionId: 'option-1',
        targetOptionActive: false,
      })
    ).toBe(false);
    expect(
      isPlanComponentCommerciallyActive({
        isActive: false,
        targetOptionId: 'option-1',
        targetOptionActive: true,
      })
    ).toBe(false);
  });

  it('exige a sequência completa e sem duplicidades ao reordenar', () => {
    expect(() => assertCompleteReorder(['a', 'b'], ['b', 'a'])).not.toThrow();
    expect(() => assertCompleteReorder(['a', 'b'], ['a', 'a'])).toThrow('duplicados');
    expect(() => assertCompleteReorder(['a', 'b'], ['a'])).toThrow('sequência completa');
  });

  it('detecta autorreferência e ciclos indiretos entre planos', () => {
    expect(wouldCreateServiceCycle('a', 'a', [])).toBe(true);
    expect(
      wouldCreateServiceCycle('c', 'a', [
        { planServiceId: 'a', targetServiceId: 'b' },
        { planServiceId: 'b', targetServiceId: 'c' },
      ])
    ).toBe(true);
    expect(
      wouldCreateServiceCycle('c', 'd', [
        { planServiceId: 'a', targetServiceId: 'b' },
        { planServiceId: 'b', targetServiceId: 'c' },
      ])
    ).toBe(false);
  });
});
