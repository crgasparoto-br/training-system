import { serviceCatalogService } from '../modules/services/service.service.js';

function readArgument(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const contractId = readArgument('--contract-id');
  const dryRun = process.argv.includes('--dry-run');

  if (!contractId) {
    throw new Error('Informe --contract-id <id-do-contrato>. Use --dry-run para apenas simular.');
  }

  const result = await serviceCatalogService.bootstrapReferenceCatalog(contractId, dryRun);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
