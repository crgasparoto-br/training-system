import {
  ACCESS_BLOCK_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
} from '@corrida/types';
import {
  ADIPOMETRY_CORRECT_BLOCK_KEY,
  ADIPOMETRY_MANAGE_BLOCK_KEY,
  ADIPOMETRY_VIEW_BLOCK_KEY,
  resolveAdipometryDraftMutationBlock,
} from './adipometry-draft-access.middleware.js';

const VIEW = ADIPOMETRY_VIEW_BLOCK_KEY;
const MANAGE = ADIPOMETRY_MANAGE_BLOCK_KEY;
const CORRECT = ADIPOMETRY_CORRECT_BLOCK_KEY;

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

  it('requires the correction capability throughout a correction draft lifecycle', () => {
    expect(resolveAdipometryDraftMutationBlock(1)).toBe(MANAGE);
    expect(resolveAdipometryDraftMutationBlock(2)).toBe(CORRECT);
    expect(resolveAdipometryDraftMutationBlock(99)).toBe(CORRECT);
  });
});
