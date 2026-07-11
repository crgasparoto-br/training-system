import { describe, expect, it, vi } from 'vitest';
import type { Aluno, AlunosResponse } from '../../services/aluno.service';
import { loadActiveStudentsForContractPreview } from './contractPreviewStudents';

function student(id: string, name: string): Aluno {
  return {
    id,
    userId: `user-${id}`,
    professorId: 'professor-1',
    schedulePlan: 'free',
    age: 30,
    user: {
      email: `${id}@example.com`,
      profile: { name },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function page(alunos: Aluno[], currentPage: number, totalPages: number): AlunosResponse {
  return {
    alunos,
    pagination: {
      page: currentPage,
      limit: 100,
      total: alunos.length,
      totalPages,
    },
  };
}

describe('loadActiveStudentsForContractPreview', () => {
  it('carrega todas as paginas, remove duplicados e ordena por nome', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce(page([student('2', 'Zeca'), student('1', 'Ana')], 1, 2))
      .mockResolvedValueOnce(page([student('1', 'Ana'), student('3', 'Bruno')], 2, 2));

    const result = await loadActiveStudentsForContractPreview(listPage);

    expect(listPage).toHaveBeenNthCalledWith(1, 1, 100, undefined, 'active');
    expect(listPage).toHaveBeenNthCalledWith(2, 2, 100, undefined, 'active');
    expect(result.map((item) => item.id)).toEqual(['1', '3', '2']);
  });
});
