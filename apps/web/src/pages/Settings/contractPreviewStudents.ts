import { alunoService, type Aluno } from '../../services/aluno.service';

export async function loadActiveStudentsForContractPreview(
  listPage: typeof alunoService.list = alunoService.list
): Promise<Aluno[]> {
  const pageSize = 100;
  const firstPage = await listPage(1, pageSize, undefined, 'active');
  const remainingPageNumbers = Array.from(
    { length: Math.max(0, firstPage.pagination.totalPages - 1) },
    (_, index) => index + 2
  );
  const remainingPages = await Promise.all(
    remainingPageNumbers.map((page) => listPage(page, pageSize, undefined, 'active'))
  );

  const uniqueStudents = new Map<string, Aluno>();
  [firstPage, ...remainingPages].forEach((response) => {
    response.alunos.forEach((student) => uniqueStudents.set(student.id, student));
  });

  return [...uniqueStudents.values()].sort((left, right) =>
    left.user.profile.name.localeCompare(right.user.profile.name, 'pt-BR', {
      sensitivity: 'base',
    })
  );
}
