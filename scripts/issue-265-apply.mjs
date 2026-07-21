import fs from 'node:fs';
import path from 'node:path';

const file = path.join(
  process.cwd(),
  'apps/api/src/modules/alunos/aluno.service.ts'
);
let content = fs.readFileSync(file, 'utf8');
const search = `      await syncStudentFixedSchedule(
        tx,
        professor.contractId,
        aluno.id,
        data.schedulePlan,
        data.schedulePlan === 'fixed' ? data.fixedScheduleSlots ?? [] : [],
        { confirmKeepFutureBookings: data.confirmKeepFutureBookings }
      );`;
const replacement = `      if (data.schedulePlan === 'fixed') {
        await syncStudentFixedSchedule(
          tx,
          professor.contractId,
          aluno.id,
          'fixed',
          data.fixedScheduleSlots ?? [],
          { confirmKeepFutureBookings: data.confirmKeepFutureBookings }
        );
      }`;
if (!content.includes(search)) {
  throw new Error('Free schedule synchronization anchor not found');
}
content = content.replace(search, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Free student creation no longer runs fixed schedule synchronization.');
