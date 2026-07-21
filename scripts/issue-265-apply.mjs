import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps/web/src/pages/Agenda.tsx');
let content = fs.readFileSync(file, 'utf8');
const search = `      if (!confirmed) return;
      await agendaService.deactivateFixedSlot(id, true);
    }

    await reloadData();`;
const replacement = `      if (!confirmed) return;
      try {
        await agendaService.deactivateFixedSlot(id, true);
      } catch (retryError: any) {
        setError(
          retryError?.response?.data?.error || agendaCopy.fixedSlotDeactivateError
        );
        return;
      }
    }

    await reloadData();`;
if (!content.includes(search)) {
  throw new Error('Confirmed deactivation retry anchor not found');
}
content = content.replace(search, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Confirmed fixed-slot deactivation retry now reports failures.');
