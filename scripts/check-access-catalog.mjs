import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourcePath = join(root, 'packages/types/access-control.ts');
const content = readFileSync(sourcePath, 'utf8');
const errors = [];

function extractCatalogItems(name) {
  const start = content.indexOf(`export const ${name} = [`);
  if (start === -1) {
    errors.push(`Catalogo ausente: ${name}`);
    return [];
  }

  const endMarker = name === 'DEFAULT_ACCESS_BY_PROFILE_CODE'
    ? '>;'
    : '] as const';
  const end = content.indexOf(endMarker, start);
  const slice = content.slice(start, end === -1 ? undefined : end);
  return [...slice.matchAll(/key:\s*'([^']+)'/g)].map((match) => match[1]);
}

const screenKeys = extractCatalogItems('ACCESS_SCREEN_CATALOG');
const blockKeys = extractCatalogItems('ACCESS_BLOCK_CATALOG');
const screenSet = new Set(screenKeys);
const blockSet = new Set(blockKeys);

if (screenKeys.length !== screenSet.size) {
  errors.push('ACCESS_SCREEN_CATALOG possui chaves duplicadas');
}

if (blockKeys.length !== blockSet.size) {
  errors.push('ACCESS_BLOCK_CATALOG possui chaves duplicadas');
}

const blockScreenKeys = [...content.matchAll(/screenKey:\s*'([^']+)'/g)].map((match) => match[1]);
for (const screenKey of blockScreenKeys) {
  if (!screenSet.has(screenKey)) {
    errors.push(`Block aponta para screenKey inexistente: ${screenKey}`);
  }
}

const dataScopeStart = content.indexOf('export const ACCESS_DATA_SCOPE_SCREEN_KEYS = [');
if (dataScopeStart === -1) {
  errors.push('ACCESS_DATA_SCOPE_SCREEN_KEYS ausente');
} else {
  const dataScopeEnd = content.indexOf('] as const', dataScopeStart);
  const dataScopeSlice = content.slice(dataScopeStart, dataScopeEnd);
  const scopedScreens = [...dataScopeSlice.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const screenKey of scopedScreens) {
    if (!screenSet.has(screenKey)) {
      errors.push(`Data scope aponta para screenKey inexistente: ${screenKey}`);
    }
  }
}

const defaultAccessStart = content.indexOf('export const DEFAULT_ACCESS_BY_PROFILE_CODE = {');
if (defaultAccessStart === -1) {
  errors.push('DEFAULT_ACCESS_BY_PROFILE_CODE ausente');
} else {
  const defaultSlice = content.slice(defaultAccessStart);
  const stringRefs = [...defaultSlice.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const value of stringRefs) {
    if (['self', 'managed', 'contract', 'professor'].includes(value)) {
      continue;
    }
    if (value.includes('.') && !screenSet.has(value) && !blockSet.has(value)) {
      errors.push(`DEFAULT_ACCESS_BY_PROFILE_CODE referencia chave desconhecida: ${value}`);
    }
  }
}

if (errors.length > 0) {
  console.error('access:check encontrou problemas:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('access:check OK');
