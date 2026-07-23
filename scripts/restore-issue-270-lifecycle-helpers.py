from pathlib import Path

path = Path('apps/api/src/modules/alunos/student-lifecycle.service.ts')
source = path.read_text()
marker = 'export async function recordStudentInvitationCreatedInTransaction('
if 'async function findAlunoInContractOrThrow(' in source:
    raise SystemExit('Lifecycle helpers already exist')
block = '''async function findAlunoInContractOrThrow(
  alunoId: string,
  contractId: string,
  client: DbClient = prisma
) {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
  }
  return aluno;
}

type TransitionOptions = {
  actor?: StudentLifecycleActorDTO;
  metadata?: Record<string, unknown>;
  alunoUpdate?: Prisma.AlunoUpdateManyMutationInput;
  onboardingUpdate?: Prisma.StudentOnboardingProcessUpdateManyMutationInput;
  additionalEvents?: StudentLifecycleEventType[];
};

async function transitionStudentLifecycleStatusInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  from: StudentLifecycleStatus,
  to: StudentLifecycleStatus,
  options: TransitionOptions = {}
): Promise<Aluno> {
  assertValidStudentLifecycleTransition(from, to);

  const updated = await tx.aluno.updateMany({
    where: { id: alunoId, contractId, status: from },
    data: { status: to, ...options.alunoUpdate },
  });

  if (updated.count !== 1) {
    const current = await tx.aluno.findFirst({ where: { id: alunoId, contractId } });
    if (!current) {
      throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
    }
    throw new StudentLifecycleError(
      'O cadastro foi alterado por outra operação. Recarregue antes de continuar.',
      'CONCURRENT_MODIFICATION',
      { expectedStatus: from, currentStatus: current.status }
    );
  }

  if (options.onboardingUpdate && Object.keys(options.onboardingUpdate).length > 0) {
    const onboarding = await tx.studentOnboardingProcess.updateMany({
      where: { alunoId, contractId },
      data: options.onboardingUpdate,
    });
    if (onboarding.count !== 1) {
      throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
    }
  }

  const events: StudentLifecycleEventType[] = [
    'STATUS_CHANGED',
    ...(options.additionalEvents ?? []),
  ];
  for (const eventType of events) {
    await tx.studentLifecycleEvent.create({
      data: {
        alunoId,
        contractId,
        eventType,
        actorUserId: options.actor?.userId,
        actorProfessorId: options.actor?.professorId,
        metadata: { from, to, ...options.metadata },
      },
    });
  }

  return tx.aluno.findUniqueOrThrow({ where: { id: alunoId } });
}

'''
if marker not in source:
    raise SystemExit('Invitation transition marker not found')
path.write_text(source.replace(marker, block + marker, 1))
