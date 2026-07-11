import { describe, expect, it } from 'vitest';
import { buildActiveContractTemplateOptions } from './contract-template-options';

const services = [
  {
    id: 'service-base',
    name: 'Treinamento personalizado',
    code: 'BASE',
    parentServiceId: null,
    isActive: true,
  },
  {
    id: 'financial-offer',
    name: 'Plano mensal',
    code: 'MONTHLY',
    parentServiceId: 'service-base',
    monthlyPrice: 350,
    isActive: true,
  },
];

describe('buildActiveContractTemplateOptions', () => {
  it('lista modelos ativos genéricos e vinculados a uma oferta filha do serviço-base', () => {
    const options = buildActiveContractTemplateOptions(
      [
        { id: 'generic', name: 'Contrato geral', version: 1, status: 'ACTIVE', serviceId: null },
        { id: 'offer', name: 'Contrato mensal', version: 2, status: 'ACTIVE', serviceId: 'financial-offer' },
        { id: 'draft', name: 'Rascunho', version: 1, status: 'DRAFT', serviceId: null },
      ],
      services,
      { alunoId: 'student-1', serviceId: 'service-base' }
    );

    expect(options.map((option) => option.id)).toEqual(['template:generic', 'template:offer']);
    expect(options[1]).toMatchObject({
      templateId: 'offer',
      alunoId: 'student-1',
      serviceId: 'financial-offer',
      status: 'ACTIVE',
      service: { name: 'Plano mensal', monthlyPrice: 350 },
    });
  });

  it('não mistura modelo de um serviço incompatível', () => {
    const options = buildActiveContractTemplateOptions(
      [
        { id: 'other', name: 'Outro contrato', version: 1, status: 'ACTIVE', serviceId: 'other-service' },
      ],
      services,
      { serviceId: 'service-base' }
    );

    expect(options).toEqual([]);
  });
});
