import { PrismaClient } from '@prisma/client';
import { libraryService } from '../library/library.service.js';
import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';
import {
  installContractDefaults,
  loadProductExerciseDefaults,
} from './contract-defaults.service.js';

const describeDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

const prisma = new PrismaClient();

describeDatabase('installContractDefaults database integration', () => {
  let targetContractId: string | null = null;
  const originalDefaultContractId = process.env.DEFAULT_CONTRACT_ID;

  afterEach(async () => {
    if (targetContractId) {
      await prisma.companyContract.deleteMany({ where: { id: targetContractId } });
      targetContractId = null;
    }
    if (originalDefaultContractId === undefined) delete process.env.DEFAULT_CONTRACT_ID;
    else process.env.DEFAULT_CONTRACT_ID = originalDefaultContractId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persiste os padrões criando somente o contrato alvo da fixture e ignora DEFAULT_CONTRACT_ID inválido', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const target = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `defaults-target-${suffix}`,
        name: 'Defaults integration target',
      },
    });
    targetContractId = target.id;
    process.env.DEFAULT_CONTRACT_ID = `missing-source-${suffix}`;

    const result = await installContractDefaults(target.id, prisma);

    expect(result.trainingParameters.installed).toBe(PRODUCT_TRAINING_PARAMETERS.length);
    expect(result.assessmentTypes.installed).toBe(PRODUCT_ASSESSMENT_TYPES.length);
    expect(result.exercises.installed).toBe(loadProductExerciseDefaults().length);
    expect(await prisma.trainingParameter.count({ where: { contractId: target.id } })).toBe(
      PRODUCT_TRAINING_PARAMETERS.length
    );
    expect(await prisma.assessmentType.count({ where: { contractId: target.id } })).toBe(
      PRODUCT_ASSESSMENT_TYPES.length
    );
    expect(await prisma.exerciseLibrary.count({ where: { contractId: target.id } })).toBe(
      loadProductExerciseDefaults().length
    );
    expect(await prisma.exerciseLibrary.count({
      where: { contractId: target.id, curationStatus: 'draft', legacyGrandfathered: false },
    })).toBe(loadProductExerciseDefaults().length);
    expect(await libraryService.listExercises(target.id)).toEqual([]);
    const first = await prisma.exerciseLibrary.findFirstOrThrow({ where: { contractId: target.id } });
    const revision = await prisma.exerciseLibraryRevision.findFirstOrThrow({
      where: { exerciseId: first.id, version: 1, action: 'system_defaults_install' },
    });
    await expect(prisma.exerciseLibraryRevision.update({
      where: { id: revision.id }, data: { action: 'tampered' },
    })).rejects.toThrow();
    await expect(prisma.exerciseLibraryRevision.delete({ where: { id: revision.id } }))
      .rejects.toThrow();
    await prisma.exerciseLibrary.update({
      where: { id: first.id },
      data: { aliases: ['Alternativa exclusiva XyZzY'], curationStatus: 'approved' },
    });
    expect((await libraryService.listExercises(target.id, { search: 'xyZZy' }))
      .map((entry) => entry.id)).toContain(first.id);
    expect(await libraryService.listExercises('unknown-foreign-contract', { search: 'xyZZy' }))
      .toEqual([]);
  });
});
