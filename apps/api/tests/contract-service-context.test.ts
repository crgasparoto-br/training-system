import { buildContractServiceVariableContext } from '../src/modules/contracts/contract-service-context';

describe('contract service variables', () => {
  it('formata conteúdo institucional, itens inclusos e componentes ativos', () => {
    const context = buildContractServiceVariableContext({
      service: {
        id: 'service-1',
        name: 'Plano Vida Saudável',
        code: 'plano_vida_saudavel',
        category: 'combined_plan',
        summary: 'Plano multidisciplinar.',
        whatIs: 'Integra treinamento, nutrição e recuperação.',
        targetAudience: 'Adultos com rotina de alta demanda.',
        description: null,
        monthlyPrice: null,
      },
      fallbackService: {
        id: 'service-1',
        name: 'Plano Vida Saudável',
        monthlyPrice: null,
      },
      presentationItems: [
        { text: 'Personal Trainer duas vezes por semana' },
        { text: 'Acompanhamento nutricional' },
      ],
      components: [
        {
          targetServiceName: null,
          targetOptionName: '2x por semana',
          targetOptionServiceName: 'Plano Essencial | Personal Trainer',
          quantity: 2,
          unit: 'sessões por semana',
          notes: null,
        },
      ],
      valorMensal: 2262,
    });

    expect(context.codigo).toBe('plano_vida_saudavel');
    expect(context.categoria).toBe('Plano combinado');
    expect(context.itensInclusos).toBe(
      'Personal Trainer duas vezes por semana; Acompanhamento nutricional'
    );
    expect(context.quantidadeItensInclusos).toBe(2);
    expect(context.plano.componentes).toContain('Plano Essencial | Personal Trainer — 2x por semana');
    expect(context.plano.componentes).toContain('2 sessões por semana');
    expect(context.valor).toBe('R$ 2.262,00');
  });

  it('preserva compatibilidade quando o catálogo estruturado ainda não está disponível', () => {
    const context = buildContractServiceVariableContext({
      service: null,
      fallbackService: {
        id: 'legacy-service',
        name: 'Personal Trainer',
        code: 'personal_trainer',
        description: 'Treinamento individualizado.',
        monthlyPrice: 900,
      },
      presentationItems: [],
      components: [],
    });

    expect(context.nome).toBe('Personal Trainer');
    expect(context.codigo).toBe('personal_trainer');
    expect(context.oQueE).toBe('Treinamento individualizado.');
    expect(context.itensInclusos).toBe('');
    expect(context.quantidadeItensInclusos).toBe(0);
  });
});
