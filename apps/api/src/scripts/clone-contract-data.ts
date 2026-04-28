import { PrismaClient } from '@prisma/client';
import { cloneContractData } from '../modules/contracts/contract-data.service.js';

const prisma = new PrismaClient();

function parseBool(value?: string, defaultValue = true) {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

async function getSourceContractId() {
  if (process.env.SOURCE_CONTRACT_ID) {
    return process.env.SOURCE_CONTRACT_ID;
  }
  const first = await prisma.contract.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return first?.id || null;
}

async function getTargetContractIds(sourceContractId: string) {
  if (process.env.TARGET_CONTRACT_ID) {
    return [process.env.TARGET_CONTRACT_ID];
  }
  const contracts = await prisma.contract.findMany({
    where: { id: { not: sourceContractId } },
    select: { id: true },
  });
  return contracts.map((item) => item.id);
}

async function main() {
  const copyParameters = parseBool(process.env.COPY_PARAMETERS, true);
  const copyExercises = parseBool(process.env.COPY_EXERCISES, true);

  const sourceContractId = await getSourceContractId();
  if (!sourceContractId) {
    console.error('No contracts found. Aborting.');
    process.exit(1);
  }

  const targetContractIds = await getTargetContractIds(sourceContractId);
  if (targetContractIds.length === 0) {
    console.log('No target contracts found. Nothing to do.');
    return;
  }

  console.log(`Source contract: ${sourceContractId}`);
  console.log(`Targets: ${targetContractIds.join(', ')}`);

  for (const targetContractId of targetContractIds) {
    console.log(`\nCloning to contract: ${targetContractId}`);

    const result = await cloneContractData({
      sourceContractId,
      targetContractId,
      copyParameters,
      copyExercises,
    });

    console.log(
      `Parameters: created ${result.parametersCreated}, skipped ${result.parametersSkipped}`
    );
    console.log(
      `Exercises: created ${result.exercisesCreated}, skipped ${result.exercisesSkipped}`
    );
  }
}

main()
  .catch((error) => {
    console.error('Failed to clone contract data:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
