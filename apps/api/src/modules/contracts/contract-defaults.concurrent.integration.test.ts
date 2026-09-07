import { PrismaClient } from '@prisma/client';
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

const prismaA = new PrismaClient();
const prismaB = new PrismaClient();

describeDatabase('installContractDefaults concurrent database integration', () => {
  let targetContractId: string | null = null;

  afterEach(async () => {
    if (targetContractId) {
      await prismaA.companyContract.deleteMany({ where: { id: targetContractId } });
      targetContractId = null;
    }
  });

  afterAll(async () => {
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
  });

  it('serializa instalações concorrentes do mesmo contrato e não duplica exercícios', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const target = await prismaA.companyContract.create({
      data: {
        type: 'academy',
        document: `defaults-concurrent-${suffix}`,
        name: 'Defaults concurrent integration target',
      },
    });
    targetContractId = target.id;

    const [first, second] = await Promise.all([
      installContractDefaults(target.id, prismaA),
      installContractDefaults(target.id, prismaB),
    ]);
    const exerciseDefaults = loadProductExerciseDefaults();

    expect(await prismaA.trainingParameter.count({ where: { contractId: target.id } })).toBe(
      PRODUCT_TRAINING_PARAMETERS.length
    );
    expect(await prismaA.assessmentType.count({ where: { contractId: target.id } })).toBe(
      PRODUCT_ASSESSMENT_TYPES.length
    );
    expect(await prismaA.exerciseLibrary.count({ where: { contractId: target.id } })).toBe(
      exerciseDefaults.length
    );

    expect(first.trainingParameters.installed + second.trainingParameters.installed).toBe(
      PRODUCT_TRAINING_PARAMETERS.length
    );
    expect(first.assessmentTypes.installed + second.assessmentTypes.installed).toBe(
      PRODUCT_ASSESSMENT_TYPES.length
    );
    expect(first.exercises.installed + second.exercises.installed).toBe(exerciseDefaults.length);
    expect([first.exercises.installed, second.exercises.installed].sort((a, b) => a - b)).toEqual([
      0,
      exerciseDefaults.length,
    ]);
  });
});
