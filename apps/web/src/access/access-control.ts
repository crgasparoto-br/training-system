import {
  ACCESS_BLOCK_CATALOG,
  ACCESS_SCREEN_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
  FALLBACK_ACCESS_PROFILE_CODE,
  type AccessDataScope,
  type AccessBlockKey,
  type AccessScreenKey,
  type AuthResponse,
} from '@corrida/types';
import type { SidebarNavItem } from '../components/sidebar';

type CurrentUser = AuthResponse['user'] | null | undefined;
type AccessProfileDefaults = {
  screens: readonly string[];
  blocks: readonly string[];
  dataScopes?: Partial<Record<string, AccessDataScope>>;
};

const defaultAccessByCode = DEFAULT_ACCESS_BY_PROFILE_CODE as Record<string, AccessProfileDefaults>;

function buildDefaultPermissions(user: CurrentUser) {
  const profileCode = user?.professor?.collaboratorFunction?.code || FALLBACK_ACCESS_PROFILE_CODE;
  const defaults = defaultAccessByCode[profileCode] || defaultAccessByCode[FALLBACK_ACCESS_PROFILE_CODE];
  const defaultScreens = new Set(defaults.screens);
  const defaultBlocks = new Set(defaults.blocks);

  return [
    ...ACCESS_SCREEN_CATALOG.map((screen) => ({
      screenKey: screen.key,
      blockKey: null,
      canView: defaultScreens.has(screen.key),
      dataScope: defaults.dataScopes?.[screen.key] ?? null,
    })),
    ...ACCESS_BLOCK_CATALOG.map((block) => ({
      screenKey: block.screenKey,
      blockKey: block.key,
      canView: defaultBlocks.has(block.key),
      dataScope: null,
    })),
  ];
}

function getPermissions(user: CurrentUser) {
  const permissions =
    user?.accessControl?.permissions ||
    user?.professor?.collaboratorFunction.accessPermissions ||
    [];

  return permissions.length > 0 ? permissions : buildDefaultPermissions(user);
}

function isMaster(user: CurrentUser) {
  return user?.accessControl?.isMaster || user?.professor?.role === 'master';
}

function normalizeBlockKey(blockKey?: string | null) {
  return blockKey || null;
}

export function canAccessScreen(
  user: CurrentUser,
  screenKey?: AccessScreenKey | string
) {
  if (!screenKey) {
    return true;
  }

  if (!user || user.type !== 'professor') {
    return false;
  }

  if (isMaster(user)) {
    return true;
  }

  return getPermissions(user).some(
    (permission) =>
      permission.screenKey === screenKey &&
      normalizeBlockKey(permission.blockKey) === null &&
      permission.canView
  );
}

export function canAccessBlock(user: CurrentUser, blockKey: AccessBlockKey | string) {
  if (!user || user.type !== 'professor') {
    return false;
  }

  if (isMaster(user)) {
    return true;
  }

  const block = ACCESS_BLOCK_CATALOG.find((item) => item.key === blockKey);

  if (block && !canAccessScreen(user, block.screenKey)) {
    return false;
  }

  return getPermissions(user).some(
    (permission) =>
      permission.blockKey === blockKey &&
      permission.canView
  );
}

export function getDataScopeForScreen(
  user: CurrentUser,
  screenKey: AccessScreenKey | string
): AccessDataScope | null {
  if (!canAccessScreen(user, screenKey)) {
    return null;
  }

  if (isMaster(user)) {
    return 'contract';
  }

  const permission = getPermissions(user).find(
    (item) => item.screenKey === screenKey && normalizeBlockKey(item.blockKey) === null
  );

  if (
    permission?.dataScope === 'self' ||
    permission?.dataScope === 'managed' ||
    permission?.dataScope === 'contract'
  ) {
    return permission.dataScope;
  }

  const profileCode = user?.professor?.collaboratorFunction?.code || FALLBACK_ACCESS_PROFILE_CODE;
  const defaults = defaultAccessByCode[profileCode] || defaultAccessByCode[FALLBACK_ACCESS_PROFILE_CODE];
  return defaults.dataScopes?.[screenKey] ?? null;
}

export function filterSidebarItemsByAccess(
  items: SidebarNavItem[],
  user: CurrentUser
): SidebarNavItem[] {
  return items
    .map((item) => {
      const children = item.children
        ? filterSidebarItemsByAccess(item.children, user)
        : undefined;
      const canSeeItem = canAccessScreen(user, item.screenKey);

      if (children?.length) {
        return { ...item, children };
      }

      if (!canSeeItem) {
        return null;
      }

      if (item.children && children?.length === 0) {
        return null;
      }

      return item;
    })
    .filter((item): item is SidebarNavItem => Boolean(item));
}
