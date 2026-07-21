import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceRequired(content, search, replacement, label) {
  if (!content.includes(search)) throw new Error(`Anchor not found: ${label}`);
  return content.replace(search, replacement);
}

{
  const file = 'apps/web/src/components/alunos/FixedScheduleEditor.tsx';
  let content = read(file);
  content = replaceRequired(content, 'CircleAlert', 'AlertCircle', 'supported alert icon');
  write(file, content);
}

{
  const file = 'apps/web/src/pages/Agenda.tsx';
  let content = read(file);
  content = replaceRequired(
    content,
    `  const handleCreateFixedSlot = async () => {
    clearMessages();
    try {`,
    `  const handleCreateFixedSlot = async () => {
    clearMessages();
    if (!fixedSlotForm.spaceId) {
      setError('Selecione o espaço da academia antes de criar o horário fixo.');
      return;
    }
    try {`,
    'agenda space validation'
  );
  content = replaceRequired(
    content,
    '        spaceId: fixedSlotForm.spaceId || undefined,',
    '        spaceId: fixedSlotForm.spaceId,',
    'required agenda space payload'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/alunos/aluno.routes.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    "    return sendError(res, error?.message || 'Erro ao criar aluno', 500);",
    "    return sendError(res, 'Erro ao criar aluno', 500);",
    'create generic internal error'
  );
  content = replaceRequired(
    content,
    "    return sendError(res, error?.message || 'Erro ao atualizar aluno', 500);",
    "    return sendError(res, 'Erro ao atualizar aluno', 500);",
    'update generic internal error'
  );
  write(file, content);
}

console.log('Issue 265 audit corrections applied successfully.');
