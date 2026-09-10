import { loadStudentInterestService } from '../src/modules/alunos/student-interest-service.service';

const makeTx = () => ({
  serviceOption: {
    findFirst: jest.fn(),
  },
});

describe('loadStudentInterestService', () => {
  it('usa exclusivamente o TransactionClient recebido para localizar o serviço', async () => {
    const tx = makeTx();
    tx.serviceOption.findFirst.mockResolvedValue({
      id: 'service-1',
      isActive: true,
      parentServiceId: null,
    });

    await expect(
      loadStudentInterestService(tx as any, 'contract-1', 'service-1')
    ).resolves.toMatchObject({ id: 'service-1' });

    expect(tx.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'service-1', contractId: 'contract-1' },
      select: { id: true, isActive: true, parentServiceId: true },
    });
  });

  it('rejeita serviço fora do contrato sem executar fallback ou bootstrap de catálogo', async () => {
    const tx = makeTx();
    tx.serviceOption.findFirst.mockResolvedValue(null);

    await expect(
      loadStudentInterestService(tx as any, 'contract-1', 'service-foreign')
    ).rejects.toThrow('Serviço selecionado não pertence ao contrato');

    expect(tx.serviceOption.findFirst).toHaveBeenCalledTimes(1);
  });

  it('preserva as mesmas regras de elegibilidade do domínio', async () => {
    const tx = makeTx();
    tx.serviceOption.findFirst
      .mockResolvedValueOnce({ id: 'inactive', isActive: false, parentServiceId: null })
      .mockResolvedValueOnce({ id: 'child', isActive: true, parentServiceId: 'parent' })
      .mockResolvedValueOnce({ id: 'inactive-current', isActive: false, parentServiceId: null });

    await expect(
      loadStudentInterestService(tx as any, 'contract-1', 'inactive')
    ).rejects.toThrow('Serviço selecionado está inativo');

    await expect(
      loadStudentInterestService(tx as any, 'contract-1', 'child')
    ).rejects.toThrow('Selecione um serviço principal no campo Serviço de Interesse');

    await expect(
      loadStudentInterestService(
        tx as any,
        'contract-1',
        'inactive-current',
        'inactive-current'
      )
    ).resolves.toMatchObject({ id: 'inactive-current' });
  });
});
