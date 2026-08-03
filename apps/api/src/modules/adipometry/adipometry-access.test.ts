import {
  ACCESS_BLOCK_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
} from '@corrida/types';

const VIEW = 'physicalAssessment.adpt.view';
const MANAGE = 'physicalAssessment.adpt.actions.manage';
const CORRECT = 'physicalAssessment.adpt.actions.correctCompleted';

describe('adipometry access contract', () => {
  it('registers every ADPT permission under the physical assessment screen', () => {
    for (const key of [VIEW, MANAGE, CORRECT]) {
      expect(ACCESS_BLOCK_CATALOG).toContainEqual(expect.objectContaining({
        key,
        screenKey: 'physicalAssessment.protocol',
      }));
    }
  });

  it('allows professors to operate drafts without implicitly correcting completed records', () => {
    expect(DEFAULT_ACCESS_BY_PROFILE_CODE.professor.blocks).toEqual(
      expect.arrayContaining([VIEW, MANAGE])
    );
    expect(DEFAULT_ACCESS_BY_PROFILE_CODE.professor.blocks).not.toContain(CORRECT);
  });

  it('grants managers the explicit completed-correction capability', () => {
    expect(DEFAULT_ACCESS_BY_PROFILE_CODE.manager.blocks).toEqual(
      expect.arrayContaining([VIEW, MANAGE, CORRECT])
    );
  });
});
