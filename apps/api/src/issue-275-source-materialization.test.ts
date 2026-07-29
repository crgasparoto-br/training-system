import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('temporary Issue 275 source materialization', () => {
  it('emits the exact verifier source through the CI test artifact', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'scripts/verify-issue-275-integrated-e2e.ts'),
      'utf8'
    );
    const encoded = Buffer.from(source, 'utf8').toString('base64');
    const chunkSize = 4000;
    for (let offset = 0; offset < encoded.length; offset += chunkSize) {
      const index = String(offset / chunkSize).padStart(3, '0');
      console.log(`ISSUE275_SOURCE_B64_${index}:${encoded.slice(offset, offset + chunkSize)}`);
    }
    expect(source).toContain('async function scenarioConcurrency');
  });
});
