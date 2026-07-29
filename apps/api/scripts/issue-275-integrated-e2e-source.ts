const ACCOUNT_A_FIXTURE =
  "body: { name: accountA.name, email: accountA.email, password: 'Senha-segura-275', role: 'STUDENT' },";
const ACCOUNT_B_FIXTURE =
  "body: { name: accountB.name, email: accountB.email, password: 'Senha-segura-275', role: 'STUDENT' },";
const ORIGINAL_WINNER_ASSERTION =
  "  assert(claims.filter((result) => result.status === 201).length === 1, 'Claims concorrentes não tiveram vencedor único');";
const ORIGINAL_CONCURRENCY_RESULT = `    claimWinnerCount: 1,
    activeInviteCount,`;

function replaceExactlyOnce(source: string, before: string, after: string, label: string): string {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`Fixture ${label} deveria ocorrer exatamente uma vez`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

export function buildIssue275IntegratedE2ESource(template: string): string {
  let source = replaceExactlyOnce(
    template,
    ACCOUNT_A_FIXTURE,
    `body: {
        name: claimLead.identity.name,
        email: accountA.email,
        password: 'Senha-segura-275',
        role: 'STUDENT',
      },`,
    'accountA'
  );
  source = replaceExactlyOnce(
    source,
    ACCOUNT_B_FIXTURE,
    `body: {
        name: claimLead.identity.name,
        email: accountB.email,
        password: 'Senha-segura-275',
        role: 'STUDENT',
      },`,
    'accountB'
  );

  source = replaceExactlyOnce(
    source,
    ORIGINAL_WINNER_ASSERTION,
    `  const claimOutcomes = claims.map((result) => {
    const details = result.body.details;
    const code =
      details && typeof details === 'object' && 'code' in details
        ? String((details as { code?: unknown }).code ?? '')
        : undefined;
    return { status: result.status, code, success: result.body.success === true };
  });
  await writeFile(
    path.join(artifactDir, 'concurrency-claim-outcomes.json'),
    \`${'${JSON.stringify(claimOutcomes, null, 2)}'}\\n\`,
    'utf8'
  );
  const claimWinnerCount = claims.filter((result) => result.status === 201).length;
  assert(
    claimWinnerCount === 1,
    \`Claims concorrentes não tiveram vencedor único: ${'${JSON.stringify(claimOutcomes)}'}\`
  );
  const losingClaim = claims.find((result) => result.status !== 201);
  const losingDetails = losingClaim?.body.details;
  const losingCode =
    losingDetails && typeof losingDetails === 'object' && 'code' in losingDetails
      ? String((losingDetails as { code?: unknown }).code ?? '')
      : undefined;
  assert(
    losingClaim?.status === 409 &&
      ['ACCOUNT_ALREADY_LINKED', 'ACCOUNT_INCOMPATIBLE'].includes(losingCode ?? ''),
    \`Claim perdedor não retornou conflito estável: ${'${JSON.stringify(claimOutcomes)}'}\`
  );
  const linkedClaim = await prisma.aluno.findUnique({
    where: { id: claimLead.id },
    select: { userId: true },
  });
  assert(Boolean(linkedClaim?.userId), 'Claim vencedor não vinculou uma conta ao Aluno');
  const linkedEvents = await prisma.studentLifecycleEvent.count({
    where: { alunoId: claimLead.id, eventType: 'ACCOUNT_LINKED' },
  });
  assert(linkedEvents === 1, 'Claims concorrentes duplicaram o evento ACCOUNT_LINKED');
  const claimedUsers = await prisma.user.findMany({
    where: { email: { in: [accountA.email, accountB.email] } },
    select: { id: true },
  });
  assert(claimedUsers.length === 1, 'Claim perdedor deixou conta órfã persistida');
  assert(
    claimedUsers[0]?.id === linkedClaim?.userId,
    'Conta persistida não corresponde ao vínculo canônico do Aluno'
  );`,
    'winner-assertion'
  );

  return replaceExactlyOnce(
    source,
    ORIGINAL_CONCURRENCY_RESULT,
    `    claimWinnerCount,
    claimLoserCode: losingCode,
    claimLinkedEventCount: linkedEvents,
    claimPersistedUserCount: claimedUsers.length,
    activeInviteCount,`,
    'concurrency-result'
  );
}
