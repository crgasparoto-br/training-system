import '../bootstrap-env.js';
import {
  SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE,
  ServiceCatalogBootstrapUnavailableError,
} from '../modules/services/service.bootstrap-errors.js';
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
  console.log('[services-catalog-bootstrap] completed', JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message =
    error instanceof ServiceCatalogBootstrapUnavailableError
      ? SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE
      : error instanceof Error
        ? error.message
        : 'Não foi possível concluir a carga do catálogo.';
  console.error('[services-catalog-bootstrap] failed', message);
  process.exitCode = 1;
});
