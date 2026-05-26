import fs from 'fs';
import path from 'path';

describe('prontuario.routes', () => {
  it('protege listagem de histórico PAR-Q por blockKey específico', () => {
    const routePath = path.resolve(__dirname, '../src/modules/prontuario/prontuario.routes.ts');
    const source = fs.readFileSync(routePath, 'utf-8');

    expect(source).toContain("router.get('/alunos/:alunoId/parq-submissions', blockAccessMiddleware('physicalAssessment.prnt.parqSubmissions')");
  });

  it('protege criação de submissão PAR-Q por blockKey específico', () => {
    const routePath = path.resolve(__dirname, '../src/modules/prontuario/prontuario.routes.ts');
    const source = fs.readFileSync(routePath, 'utf-8');

    expect(source).toContain("router.post('/alunos/:alunoId/parq-submissions', blockAccessMiddleware('physicalAssessment.prnt.actions.createParqSubmission')");
  });
});