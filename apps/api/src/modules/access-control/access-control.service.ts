import { PrismaClient, type Prisma } from '@prisma/client';
import {
  ACCESS_BLOCK_CATALOG,
  ALL_ACCESS_SCREEN_KEYS,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
  FALLBACK_ACCESS_PROFILE_CODE,
  type AccessPermissionSelection,
  type AccessScreenKey,
} from '@corrida/types';

const prisma = new PrismaClient();
const SCREEN_LEVEL_BLOCK_KEY = '';

type DbClient = PrismaClient | Prisma.TransactionClient;

type AccessPermissionRow = {
  id?: string;
  collaboratorFunctionId: string;
  screenKey: string;
  blockKey: string;
  canView: boolean;
};

type AccessProfileDefaults = {
  screens: readonly string[];
  blocks: readonly string[];
};

const defaultAccessByCode = DEFAULT_ACCESS_BY_PROFILE_CODE as Record<string, AccessProfileDefaults>;

const knownBlockKeys = ACCESS_BLOCK_CATALOG.map((item) => item.key);

function getDefaultAccessForProfile(profileCode: string): AccessProfileDefaults {
  return defaultAccessByCode[profileCode] || defaultAccessByCode[FALLBACK_ACCESS_PROFILE_CODE];
}

function buildPermissionMatrix(
  collaboratorFunctionId: string,
  profileCode: string,
  selection?: AccessPermissionSelection
) {
  const defaultAccess = getDefaultAccessForProfile(profileCode);
  const selectedScreens = new Set(selection?.screens ?? defaultAccess.screens);
  const selectedBlocks = new Set(selection?.blocks ?? defaultAccess.blocks);

  const screenRows = ALL_ACCESS_SCREEN_KEYS.map((screenKey) => ({
    collaboratorFunctionId,
    screenKey,
    blockKey: SCREEN_LEVEL_BLOCK_KEY,
    canView: selectedScreens.has(screenKey),
  }));

  const blockRows = ACCESS_BLOCK_CATALOG.map((block) => ({
    collaboratorFunctionId,
    screenKey: block.screenKey,
    blockKey: block.key,
    canView: selectedBlocks.has(block.key),
  }));

  return [...screenRows, ...blockRows];
}

function permissionKey(permission: Pick<AccessPermissionRow, 'screenKey' | 'blockKey'>) {
  return `${permission.screenKey}:${permission.blockKey || SCREEN_LEVEL_BLOCK_KEY}`;
}

export function serializeAccessPermission(permission: AccessPermissionRow) {
  return {
    ...(permission.id ? { id: permission.id } : {}),
    collaboratorFunctionId: permission.collaboratorFunctionId,
    screenKey: permission.screenKey,
    blockKey: permission.blockKey || null,
    canView: permission.canView,
  };
}

export function buildFullAccessPermissions() {
  const screens = ALL_ACCESS_SCREEN_KEYS.map((screenKey) =>
    serializeAccessPermission({
      collaboratorFunctionId: '',
      screenKey,
      blockKey: SCREEN_LEVEL_BLOCK_KEY,
      canView: true,
    })
  );

  const blocks = ACCESS_BLOCK_CATALOG.map((block) =>
    serializeAccessPermission({
      collaboratorFunctionId: '',
      screenKey: block.screenKey,
      blockKey: block.key,
      canView: true,
    })
  );

  return [...screens, ...blocks];
}

export async function syncAccessPermissionsForFunction(
  collaboratorFunctionId: string,
  profileCode: string,
  client: DbClient = prisma
) {
  const existing = await client.accessPermission.findMany({
    where: { collaboratorFunctionId },
    orderBy: [{ screenKey: 'asc' }, { blockKey: 'asc' }],
  });

  const existingKeys = new Set(existing.map(permissionKey));
  const missingRows = buildPermissionMatrix(collaboratorFunctionId, profileCode).filter(
    (permission) => !existingKeys.has(permissionKey(permission))
  );

  if (missingRows.length > 0) {
    await client.accessPermission.createMany({
      data: missingRows,
      skipDuplicates: true,
    });
  }

  return client.accessPermission.findMany({
    where: { collaboratorFunctionId },
    orderBy: [{ screenKey: 'asc' }, { blockKey: 'asc' }],
  });
}

export async function syncAccessPermissionsForContract(
  contractId: string,
  client: DbClient = prisma
) {
  const collaboratorFunctions = await client.collaboratorFunctionOption.findMany({
    where: { contractId },
    select: { id: true, code: true },
  });

  for (const collaboratorFunction of collaboratorFunctions) {
    await syncAccessPermissionsForFunction(
      collaboratorFunction.id,
      collaboratorFunction.code,
      client
    );
  }
}

export async function replaceAccessPermissionsForFunction(
  collaboratorFunctionId: string,
  profileCode: string,
  selection: AccessPermissionSelection,
  client: DbClient = prisma
) {
  const knownScreens = new Set<string>(ALL_ACCESS_SCREEN_KEYS);
  const knownBlocks = new Set<string>(knownBlockKeys);
  const sanitizedSelection: AccessPermissionSelection = {
    screens: selection.screens.filter((screenKey) => knownScreens.has(screenKey)),
    blocks: selection.blocks.filter((blockKey) => knownBlocks.has(blockKey)),
  };
  const permissions = buildPermissionMatrix(
    collaboratorFunctionId,
    profileCode,
    sanitizedSelection
  );

  await client.accessPermission.deleteMany({
    where: { collaboratorFunctionId },
  });

  await client.accessPermission.createMany({
    data: permissions,
    skipDuplicates: true,
  });

  return client.accessPermission.findMany({
    where: { collaboratorFunctionId },
    orderBy: [{ screenKey: 'asc' }, { blockKey: 'asc' }],
  });
}

export async function getEffectiveAccessPermissionsForProfessor(professor: {
  role: 'master' | 'professor';
  collaboratorFunction: {
    id: string;
    code: string;
    accessPermissions?: AccessPermissionRow[];
  };
}) {
  if (professor.role === 'master') {
    return buildFullAccessPermissions();
  }

  const permissions =
    professor.collaboratorFunction.accessPermissions &&
    professor.collaboratorFunction.accessPermissions.length > 0
      ? professor.collaboratorFunction.accessPermissions
      : await syncAccessPermissionsForFunction(
          professor.collaboratorFunction.id,
          professor.collaboratorFunction.code
        );

  return permissions.map(serializeAccessPermission);
}

export async function canProfessorAccessScreen(
  professor: {
    role: 'master' | 'professor';
    collaboratorFunction: {
      id: string;
      code: string;
    };
  },
  screenKey: AccessScreenKey | string
) {
  if (professor.role === 'master') {
    return true;
  }

  const permissions = await syncAccessPermissionsForFunction(
    professor.collaboratorFunction.id,
    professor.collaboratorFunction.code
  );

  return permissions.some(
    (permission) =>
      permission.screenKey === screenKey &&
      permission.blockKey === SCREEN_LEVEL_BLOCK_KEY &&
      permission.canView
  );
}
