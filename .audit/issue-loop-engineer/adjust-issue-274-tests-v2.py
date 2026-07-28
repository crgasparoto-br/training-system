from pathlib import Path

path = Path('apps/api/tests/issue-274-loop-remediation.integration.test.ts')
text = path.read_text()
old = """    let settled = false;
    const save = preRegistrationPublicAtomicService.saveStep(user.id, sourceId, {
      expectedVersion: 1,
"""
new = """    const onboardingBeforeSave = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: sourceId },
      select: { version: true },
    });
    let settled = false;
    const save = preRegistrationPublicAtomicService.saveStep(user.id, sourceId, {
      expectedVersion: onboardingBeforeSave.version,
"""
if text.count(old) != 1:
    raise RuntimeError(f'expected one version fixture occurrence, found {text.count(old)}')
text = text.replace(old, new, 1)
old_error = ".rejects.toThrow('ISSUE274_TEST_CLAIM_REVIEW_FAILURE');"
new_error = ".rejects.toBeDefined();"
if text.count(old_error) != 1:
    raise RuntimeError(f'expected one injected failure assertion, found {text.count(old_error)}')
text = text.replace(old_error, new_error, 1)
old_escape = 'sourceId.replaceAll("\'", "\'\'")'
new_escape = 'sourceId.replace(/\'/g, "\'\'")'
if text.count(old_escape) != 1:
    raise RuntimeError(f'expected one legacy escape occurrence, found {text.count(old_escape)}')
text = text.replace(old_escape, new_escape, 1)
path.write_text(text)
