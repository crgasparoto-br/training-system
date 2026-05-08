import { resolveAssetUrl } from './assetUrl';

// Casos de teste
const testCases = [
  // URLs antigas com host incorreto
  {
    input: 'http://old-host.com/uploads/contracts/logos/1234-image.png',
    description: 'URL antiga com host incorreto (http)',
    expectedContains: '/uploads/contracts/logos/1234-image.png'
  },
  {
    input: 'https://staging-api.com/uploads/professores/5678-avatar.jpg',
    description: 'URL antiga com host incorreto (https)',
    expectedContains: '/uploads/professores/5678-avatar.jpg'
  },
  // URLs modernas
  {
    input: '/uploads/contracts/logos/1234-image.png',
    description: 'URL com /uploads absoluto',
    expectedContains: '/uploads/contracts/logos/1234-image.png'
  },
  {
    input: 'uploads/contracts/logos/1234-image.png',
    description: 'URL com uploads relativo',
    expectedContains: '/uploads/contracts/logos/1234-image.png'
  },
  // URLs externas intactas
  {
    input: 'https://external.com/image.png',
    description: 'URL externa sem /uploads',
    expectedEquals: 'https://external.com/image.png'
  },
  {
    input: 'data:image/png;base64,iVBORw0KG...',
    description: 'Data URL',
    expectedEquals: 'data:image/png;base64,iVBORw0KG...'
  },
  {
    input: 'blob:http://localhost:5173/123456',
    description: 'Blob URL',
    expectedEquals: 'blob:http://localhost:5173/123456'
  },
  // Casos vazios
  {
    input: null,
    description: 'null',
    expectedEquals: ''
  },
  {
    input: undefined,
    description: 'undefined',
    expectedEquals: ''
  },
  {
    input: '   ',
    description: 'Whitespace only',
    expectedEquals: ''
  },
];

console.log('🧪 Testando resolveAssetUrl...\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = resolveAssetUrl(test.input);
  let success = false;

  if (test.expectedEquals !== undefined) {
    success = result === test.expectedEquals;
  } else if (test.expectedContains !== undefined) {
    success = result.includes(test.expectedContains);
  }

  if (success) {
    console.log(`✅ ${test.description}`);
    console.log(`   Input:  ${test.input}`);
    console.log(`   Output: ${result}\n`);
    passed++;
  } else {
    console.log(`❌ ${test.description}`);
    console.log(`   Input:    ${test.input}`);
    console.log(`   Output:   ${result}`);
    console.log(`   Expected: ${test.expectedEquals || `contains ${test.expectedContains}`}\n`);
    failed++;
  }
}

console.log(`\n📊 Resultados: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
