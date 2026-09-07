import fs from 'node:fs';
import path from 'node:path';

function readRepositoryFile(relativePath: string) {
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), '..', '..', relativePath),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));

  if (!resolved) {
    throw new Error(`Arquivo versionado não encontrado: ${relativePath}`);
  }

  return fs.readFileSync(resolved, 'utf-8');
}

describe('contract defaults normative documentation', () => {
  const apiArchitecture = readRepositoryFile('docs/architecture/api.md');
  const defaultsArchitecture = readRepositoryFile('docs/architecture/contract-defaults.md');
  const envExample = readRepositoryFile('.env.example');
  const contractEntryRoutes = readRepositoryFile(
    'apps/api/src/modules/contracts/contract-entry.routes.ts'
  );

  it('keeps product defaults independent from automatic tenant source selection', () => {
    expect(apiArchitecture).toContain('POST /api/v1/contracts/install-defaults');
    expect(apiArchitecture).toContain('`DEFAULT_CONTRACT_ID` não participa da instalação de padrões');
    expect(apiArchitecture).not.toContain('`DEFAULT_CONTRACT_ID` tem precedência');
    expect(apiArchitecture).not.toContain('a API seleciona outro contrato elegível');
    expect(apiArchitecture).not.toContain('fallback legado de `DEFAULT_CONTRACT_ID`');

    expect(defaultsArchitecture).toContain('não pode escolher outro tenant como origem implícita');
    expect(defaultsArchitecture).toContain('nunca seleciona outro tenant automaticamente');
    expect(envExample).not.toContain('DEFAULT_CONTRACT_ID=');
  });

  it('keeps the canonical defaults router ahead of the legacy compatibility router', () => {
    const defaultsRegistration = contractEntryRoutes.indexOf('router.use(contractDefaultsRoutes)');
    const legacyRegistration = contractEntryRoutes.indexOf('router.use(legacyContractRoutes)');

    expect(defaultsRegistration).toBeGreaterThanOrEqual(0);
    expect(legacyRegistration).toBeGreaterThanOrEqual(0);
    expect(defaultsRegistration).toBeLessThan(legacyRegistration);
  });
});
