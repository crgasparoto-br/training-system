import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = fs.readFileSync(path.join(root, 'prisma.config.ts'), 'utf8');
const apiPackage = JSON.parse(fs.readFileSync(path.join(root, 'apps/api/package.json'), 'utf8'));
const expectedSchema = 'apps/api/prisma/schema.prisma';
const expectedMigrations = 'apps/api/prisma/migrations';

if (!config.includes(`schema: "${expectedSchema}"`)
  || !config.includes(`path: "${expectedMigrations}"`)) {
  throw new Error(`prisma.config.ts deve apontar para ${expectedSchema} e ${expectedMigrations}`);
}
for (const [name, command] of Object.entries(apiPackage.scripts ?? {})) {
  if (/^(db:generate|db:migrate|db:migrate:prod)$/.test(name)
    && !String(command).includes('--schema prisma/schema.prisma')) {
    throw new Error(`apps/api script ${name} não usa o schema operacional da API`);
  }
}
for (const relative of [expectedSchema, expectedMigrations]) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Fonte Prisma ausente: ${relative}`);
}
console.log(`Prisma source of truth: ${expectedSchema}; migrations: ${expectedMigrations}`);
