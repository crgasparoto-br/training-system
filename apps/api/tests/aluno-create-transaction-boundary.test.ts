import fs from 'fs';
import path from 'path';

const readAlunoModule = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, `../src/modules/alunos/${name}`), 'utf8');

describe('aluno creation transaction boundary', () => {
  it('impede retorno ao catálogo com PrismaClient externo dentro da transação', () => {
    const alunoServiceSource = readAlunoModule('aluno.service.ts');
    const financialServiceSource = readAlunoModule('student-financial-contract.service.ts');
    const lookupSource = readAlunoModule('student-interest-service.service.ts');

    expect(alunoServiceSource).not.toContain('getServiceForContract');
    expect(alunoServiceSource).not.toContain('ensureDefaultServicesForContract');
    expect(alunoServiceSource).toContain('loadStudentInterestService(\n          tx,');

    expect(financialServiceSource).not.toContain('const loadInterestService');
    expect(financialServiceSource).toContain(
      "import { loadStudentInterestService } from './student-interest-service.service.js';"
    );

    expect(lookupSource).toContain('tx: Prisma.TransactionClient');
    expect(lookupSource).toContain('tx.serviceOption.findFirst');
    expect(lookupSource).toContain('assertStudentInterestServiceSelectable');
    expect(lookupSource).not.toContain('new PrismaClient');
    expect(lookupSource).not.toContain('ensureDefaultServicesForContract');
  });

  it('mantém identidade, onboarding e respostas administrativas dentro do callback transacional', () => {
    const source = readAlunoModule('aluno.service.ts');
    const transactionStart = source.indexOf('const aluno = await prisma.$transaction(async (tx) => {');
    const transactionReturn = source.indexOf("    return {\n      aluno,\n      tempPassword,\n    };", transactionStart);
    const transactionBody = source.slice(transactionStart, transactionReturn);

    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionBody).toContain('await tx.aluno.create');
    expect(transactionBody).toContain('await tx.studentOnboardingProcess.create');
    expect(transactionBody).toContain('await upsertStudentIdentity(');
    expect(transactionBody).toContain('client: tx');
    expect(transactionBody).toContain('await upsertStudentAdministrativeFormResponses(\n          tx,');
  });
});
