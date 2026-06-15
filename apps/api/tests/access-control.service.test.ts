const mockPrisma = {
  accessPermission: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  collaboratorFunctionOption: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: { JsonNull: null },
}));

import {
  ACCESS_BLOCK_CATALOG,
  ALL_ACCESS_SCREEN_KEYS,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
} from '@corrida/types';
import {
  buildProfessorDataScopeWhere,
  canAccessOwnData,
  canProfessorAccessBlock,
  canProfessorAccessScreen,
  getEffectiveAccessPermissionsForProfessor,
  replaceAccessPermissionsForFunction,
  syncAccessPermissionsForFunction,
} from '../src/modules/access-control/access-control.service';

type Row = {
  id?: string;
  collaboratorFunctionId: string;
  screenKey: string;
  blockKey: string;
  canView: boolean;
  dataScope?: string | null;
};

function keyOf(row: Pick<Row, 'screenKey' | 'blockKey'>) {
  return `${row.screenKey}:${row.blockKey || ''}`;
}

function createDb(seed: Row[] = []) {
  let rows = [...seed];

  const accessPermission = {
    findMany: jest.fn(async ({ where }: { where: { collaboratorFunctionId: string } }) => {
      return rows
        .filter((row) => row.collaboratorFunctionId === where.collaboratorFunctionId)
        .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    }),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      for (const row of data) {
        const exists = rows.some(
          (item) =>
            item.collaboratorFunctionId === row.collaboratorFunctionId &&
            item.screenKey === row.screenKey &&
            item.blockKey === row.blockKey,
        );

        if (!exists) {
          rows.push({ ...row });
        }
      }

      return { count: data.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: { collaboratorFunctionId: string } }) => {
      rows = rows.filter((row) => row.collaboratorFunctionId !== where.collaboratorFunctionId);
      return { count: 0 };
    }),
  };

  return {
    accessPermission,
    getRows: () => rows,
  };
}

describe('access-control.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.accessPermission.findMany.mockResolvedValue([]);
    mockPrisma.accessPermission.createMany.mockResolvedValue({ count: 0 });
  });

  it('syncAccessPermissionsForFunction cria linhas faltantes', async () => {
    const db = createDb();

    const result = await syncAccessPermissionsForFunction('fn-1', 'manager', db as never);

    expect(result.length).toBe(ALL_ACCESS_SCREEN_KEYS.length + ACCESS_BLOCK_CATALOG.length);
    expect(db.accessPermission.createMany).toHaveBeenCalledTimes(1);
  });

  it('sincronizacao nao sobrescreve permissoes existentes', async () => {
    const db = createDb([
      {
        collaboratorFunctionId: 'fn-2',
        screenKey: 'students.registration',
        blockKey: '',
        canView: false,
        dataScope: null,
      },
    ]);

    const result = await syncAccessPermissionsForFunction('fn-2', 'professor', db as never);

    const existing = result.find(
      (row) => row.screenKey === 'students.registration' && row.blockKey === '',
    );

    expect(existing?.canView).toBe(false);
  });

  it('replaceAccessPermissionsForFunction ignora chaves invalidas', async () => {
    const db = createDb();

    const result = await replaceAccessPermissionsForFunction(
      'fn-3',
      'intern',
      {
        screens: ['students.details', 'invalid.screen'],
        blocks: ['students.details.summary', 'invalid.block'],
        dataScopes: {
          'collaborators.registration': 'self',
          'invalid.screen': 'contract',
        },
      },
      db as never,
    );

    const detailsScreen = result.find(
      (row) => row.screenKey === 'students.details' && row.blockKey === '',
    );
    const summaryBlock = result.find((row) => row.blockKey === 'students.details.summary');

    expect(detailsScreen?.canView).toBe(true);
    expect(summaryBlock?.canView).toBe(true);
    expect(result.some((row) => row.screenKey === 'invalid.screen')).toBe(false);
    expect(result.some((row) => row.blockKey === 'invalid.block')).toBe(false);
  });

  it('professor master recebe acesso total', async () => {
    const result = await getEffectiveAccessPermissionsForProfessor({
      role: 'master',
      collaboratorFunction: {
        id: 'fn-master',
        code: 'professor',
      },
    });

    expect(result.length).toBe(ALL_ACCESS_SCREEN_KEYS.length + ACCESS_BLOCK_CATALOG.length);
    expect(result.every((permission) => permission.canView)).toBe(true);
  });

  it('perfil sem matriz recebe fallback/default via sync', async () => {
    const db = createDb();

    const result = await syncAccessPermissionsForFunction('fn-4', 'intern', db as never);

    const summaryBlock = result.find((row) => row.blockKey === 'students.details.summary');
    const financialBlock = result.find((row) => row.blockKey === 'students.details.financialContract');
    const detailsScreen = result.find(
      (row) => row.screenKey === 'students.details' && row.blockKey === '',
    );

    expect(detailsScreen?.canView).toBe(true);
    expect(summaryBlock?.canView).toBe(true);
    expect(financialBlock?.canView).toBe(false);

    const defaults = DEFAULT_ACCESS_BY_PROFILE_CODE.intern;
    expect(defaults.blocks.includes('students.details.summary')).toBe(true);
  });

  it('canProfessorAccessScreen nega tela sem permissao', async () => {
    mockPrisma.accessPermission.findMany.mockResolvedValue([
      {
        collaboratorFunctionId: 'fn-denied',
        screenKey: 'students.details',
        blockKey: '',
        canView: false,
        dataScope: null,
      },
    ]);

    await expect(
      canProfessorAccessScreen(
        { role: 'professor', collaboratorFunction: { id: 'fn-denied', code: 'intern' } },
        'students.details',
      ),
    ).resolves.toBe(false);
  });

  it('canProfessorAccessBlock exige tela pai e bloco permitidos', async () => {
    mockPrisma.accessPermission.findMany.mockResolvedValue([
      {
        collaboratorFunctionId: 'fn-block',
        screenKey: 'students.details',
        blockKey: '',
        canView: true,
        dataScope: null,
      },
      {
        collaboratorFunctionId: 'fn-block',
        screenKey: 'students.details',
        blockKey: 'students.details.financialContract',
        canView: false,
        dataScope: null,
      },
    ]);

    await expect(
      canProfessorAccessBlock(
        { role: 'professor', collaboratorFunction: { id: 'fn-block', code: 'intern' } },
        'students.details.financialContract',
      ),
    ).resolves.toBe(false);

    mockPrisma.accessPermission.findMany.mockResolvedValue([
      {
        collaboratorFunctionId: 'fn-block',
        screenKey: 'students.details',
        blockKey: '',
        canView: true,
        dataScope: null,
      },
      {
        collaboratorFunctionId: 'fn-block',
        screenKey: 'students.details',
        blockKey: 'students.details.financialContract',
        canView: true,
        dataScope: null,
      },
    ]);

    await expect(
      canProfessorAccessBlock(
        { role: 'professor', collaboratorFunction: { id: 'fn-block', code: 'manager' } },
        'students.details.financialContract',
      ),
    ).resolves.toBe(true);
  });

  it('buildProfessorDataScopeWhere aplica escopo contract', () => {
    expect(buildProfessorDataScopeWhere('contract-1', 'prof-1', 'contract')).toEqual({
      contractId: 'contract-1',
    });
  });

  it('buildProfessorDataScopeWhere aplica escopo managed', () => {
    expect(buildProfessorDataScopeWhere('contract-1', 'prof-1', 'managed')).toEqual({
      contractId: 'contract-1',
      OR: [{ id: 'prof-1' }, { responsibleManagerId: 'prof-1' }],
    });
  });

  it('buildProfessorDataScopeWhere aplica escopo self', () => {
    expect(buildProfessorDataScopeWhere('contract-1', 'prof-1', 'self')).toEqual({
      contractId: 'contract-1',
      id: 'prof-1',
    });
  });

  it('buildProfessorDataScopeWhere bloqueia consulta quando nao existe professor ator', () => {
    expect(buildProfessorDataScopeWhere('contract-1', undefined, 'self')).toEqual({
      contractId: 'contract-1',
      id: '__no_actor_professor__',
    });

    expect(buildProfessorDataScopeWhere('contract-1', undefined, 'managed')).toEqual({
      contractId: 'contract-1',
      id: '__no_actor_professor__',
    });
  });

  it('canAccessOwnData permite apenas o proprio professor', () => {
    expect(canAccessOwnData('prof-1', 'prof-1')).toBe(true);
    expect(canAccessOwnData('prof-2', 'prof-1')).toBe(false);
    expect(canAccessOwnData('prof-1')).toBe(false);
  });
});