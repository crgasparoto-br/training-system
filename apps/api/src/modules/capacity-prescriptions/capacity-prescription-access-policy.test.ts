import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import {
  CAPACITY_GOAL_CLASSIFICATION_READ_BLOCKS,
  CAPACITY_GOAL_CLASSIFICATION_WRITE_BLOCKS,
  canProfessorAccessCapacityBlocks,
} from './capacity-prescription-access-policy.js';

jest.mock('../access-control/access-control.service.js', () => ({
  canProfessorAccessBlock: jest.fn(),
}));

const canAccess = canProfessorAccessBlock as jest.MockedFunction<
  typeof canProfessorAccessBlock
>;

const professor = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', code: 'professor' },
} as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('capacity prescription access policy', () => {
  it('compõe leitura de classificação com o bloco de objetivos do PRNT', () => {
    expect(CAPACITY_GOAL_CLASSIFICATION_READ_BLOCKS).toEqual([
      'plans.capacityPrescriptions.view',
      'physicalAssessment.prnt.goals',
    ]);
  });

  it('compõe escrita de classificação com o bloco de objetivos do PRNT', () => {
    expect(CAPACITY_GOAL_CLASSIFICATION_WRITE_BLOCKS).toEqual([
      'plans.capacityPrescriptions.manage',
      'physicalAssessment.prnt.goals',
    ]);
  });

  it('nega quando qualquer bloco composto estiver indisponível', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey === 'plans.capacityPrescriptions.manage'
    );

    await expect(
      canProfessorAccessCapacityBlocks(
        professor,
        CAPACITY_GOAL_CLASSIFICATION_WRITE_BLOCKS
      )
    ).resolves.toBe(false);

    expect(canAccess).toHaveBeenNthCalledWith(
      1,
      professor,
      'plans.capacityPrescriptions.manage'
    );
    expect(canAccess).toHaveBeenNthCalledWith(
      2,
      professor,
      'physicalAssessment.prnt.goals'
    );
  });
});
