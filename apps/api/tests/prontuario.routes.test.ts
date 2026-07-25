import fs from 'fs';
import path from 'path';

describe('prontuario.routes', () => {
  const routePath = path.resolve(__dirname, '../src/modules/prontuario/prontuario.routes.ts');
  const source = fs.readFileSync(routePath, 'utf-8');

  it('protege listagem de histórico PAR-Q por blockKey específico', () => {
    expect(source).toContain("router.get('/alunos/:alunoId/parq-submissions', blockAccessMiddleware('physicalAssessment.prnt.parqSubmissions')");
  });

  it('desativa a gravação clínica legada com resposta reconhecível', () => {
    expect(source).toContain("router.post('/alunos/:alunoId/parq-submissions'");
    expect(source).toContain("{ code: 'LEGACY_WRITE_DISABLED' }");
    expect(source).toContain('410');
  });

  it('protege a análise profissional com permissão específica', () => {
    expect(source).toContain("blockAccessMiddleware('physicalAssessment.prnt.actions.reviewParq')");
    expect(source).toContain('reviewProfessional');
  });
});
