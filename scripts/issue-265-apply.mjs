import fs from 'node:fs';
import path from 'node:path';

const file = path.join(
  process.cwd(),
  'apps/web/src/components/alunos/FixedScheduleEditor.tsx'
);
const content = fs.readFileSync(file, 'utf8');
if (!content.includes('CircleAlert')) {
  throw new Error('Unsupported alert icon occurrence not found');
}
fs.writeFileSync(file, content.replaceAll('CircleAlert', 'AlertCircle'), 'utf8');
console.log('Remaining issue 265 icon references replaced successfully.');
