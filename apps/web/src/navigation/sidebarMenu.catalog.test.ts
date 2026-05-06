import {
  ACCESS_BLOCK_CATALOG,
  ACCESS_SCREEN_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
  ACCESS_PERMISSION_GROUPS,
} from '@corrida/types';
import { describe, expect, it } from 'vitest';

describe('catalogo de permissoes', () => {
  it('todas as telas aparecem em algum grupo ou em outras telas', () => {
    const groupedKeys = new Set(ACCESS_PERMISSION_GROUPS.flatMap((group) => group.screenKeys));
    const allScreenKeys = ACCESS_SCREEN_CATALOG.map((screen) => screen.key);
    const otherScreens = allScreenKeys.filter((key) => !groupedKeys.has(key));

    const covered = new Set([...groupedKeys, ...otherScreens]);

    expect([...covered].sort()).toEqual([...allScreenKeys].sort());
  });

  it('todos os blocos apontam para uma tela existente', () => {
    const validScreens = new Set(ACCESS_SCREEN_CATALOG.map((screen) => screen.key));

    for (const block of ACCESS_BLOCK_CATALOG) {
      expect(validScreens.has(block.screenKey)).toBe(true);
    }
  });

  it('defaults nao referenciam telas ou blocos inexistentes', () => {
    const validScreens = new Set(ACCESS_SCREEN_CATALOG.map((screen) => screen.key));
    const validBlocks = new Set(ACCESS_BLOCK_CATALOG.map((block) => block.key));

    for (const defaults of Object.values(DEFAULT_ACCESS_BY_PROFILE_CODE)) {
      for (const screenKey of defaults.screens) {
        expect(validScreens.has(screenKey)).toBe(true);
      }

      for (const blockKey of defaults.blocks) {
        expect(validBlocks.has(blockKey)).toBe(true);
      }
    }
  });
});
