import {
  ACCESS_BLOCK_CATALOG,
  ACCESS_DATA_SCOPE_SCREEN_KEYS,
} from '@corrida/types';
import { describe, expect, it } from 'vitest';
import { isPreRegistrationUiEnabled } from '../config/pre-registration-rollout';
import type { SidebarNavItem } from '../components/sidebar';
import {
  buildEffectiveSidebarNavigation,
  buildPermissionTreeGroups,
  effectiveSidebarMenuItems,
  effectiveSidebarNavigation,
} from './sidebarMenu';

const PRE_REGISTRATION_SCREEN_KEY = 'students.preRegistration';

function findItem(items: SidebarNavItem[], id: string): SidebarNavItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children ? findItem(item.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

describe('navegacao efetiva de leads e pre-matriculas', () => {
  it('usa a decisao canonica de rollout para compor a navegacao compartilhada', () => {
    const enabled = isPreRegistrationUiEnabled({ configuredValue: 'yes', production: true });
    const navigation = buildEffectiveSidebarNavigation(enabled);

    expect(enabled).toBe(true);
    expect(findItem(navigation.items, 'pre-matriculas')).toMatchObject({
      label: 'Leads e pré-matrículas',
      path: '/pre-matriculas',
      screenKey: PRE_REGISTRATION_SCREEN_KEY,
    });
    expect(effectiveSidebarMenuItems).toBe(effectiveSidebarNavigation.items);
  });

  it('posiciona a permissao em Alunos > Operacao do aluno e fora das permissoes internas', () => {
    const groups = buildPermissionTreeGroups(buildEffectiveSidebarNavigation(true));
    const studentsGroup = groups.find((group) => group.id === 'atendimento');
    const internalGroup = groups.find((group) => group.id === 'internal');

    expect(studentsGroup?.screenKeys).toContain(PRE_REGISTRATION_SCREEN_KEY);
    expect(internalGroup?.screenKeys ?? []).not.toContain(PRE_REGISTRATION_SCREEN_KEY);

    const operationIndex = studentsGroup?.rows.findIndex(
      (row) => row.kind === 'sub-header' && row.label === 'Operação do aluno',
    ) ?? -1;
    const screenIndex = studentsGroup?.rows.findIndex(
      (row) => row.kind === 'screen' && row.screenKey === PRE_REGISTRATION_SCREEN_KEY,
    ) ?? -1;
    const screenRow = studentsGroup?.rows[screenIndex];

    expect(operationIndex).toBeGreaterThanOrEqual(0);
    expect(screenIndex).toBeGreaterThan(operationIndex);
    expect(screenRow).toMatchObject({
      kind: 'screen',
      label: 'Leads e pré-matrículas',
      depth: 2,
    });
  });

  it('nao projeta a permissao em nenhum grupo quando o rollout esta desabilitado', () => {
    const disabled = isPreRegistrationUiEnabled({ configuredValue: 'off', production: true });
    const navigation = buildEffectiveSidebarNavigation(disabled);
    const groups = buildPermissionTreeGroups(navigation);

    expect(disabled).toBe(false);
    expect(findItem(navigation.items, 'pre-matriculas')).toBeUndefined();
    expect(navigation.hiddenPermissionScreenKeys.has(PRE_REGISTRATION_SCREEN_KEY)).toBe(true);
    expect(groups.some((group) => group.screenKeys.includes(PRE_REGISTRATION_SCREEN_KEY))).toBe(false);
    expect(
      groups.some((group) => group.rows.some(
        (row) => row.kind === 'screen' && row.screenKey === PRE_REGISTRATION_SCREEN_KEY,
      )),
    ).toBe(false);
  });

  it('preserva os sete blocos publicos e o dataScope da tela de pre-matriculas', () => {
    const blockKeys = ACCESS_BLOCK_CATALOG
      .filter((block) => block.screenKey === PRE_REGISTRATION_SCREEN_KEY)
      .map((block) => block.key);

    expect(blockKeys).toEqual([
      'students.preRegistration.create',
      'students.preRegistration.editCommercial',
      'students.preRegistration.generateInvite',
      'students.preRegistration.revokeInvite',
      'students.preRegistration.review',
      'students.preRegistration.discardReopen',
      'students.preRegistration.convert',
    ]);
    expect(ACCESS_DATA_SCOPE_SCREEN_KEYS).toContain(PRE_REGISTRATION_SCREEN_KEY);
  });
});
