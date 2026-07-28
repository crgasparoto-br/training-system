from pathlib import Path

path = Path('apps/api/src/modules/alunos/student-identity.service.ts')
text = path.read_text()
old = 'SELECT pg_advisory_xact_lock(hashtextextended(${contractId}, 27417)) AS \\"locked\\"'
new = 'SELECT pg_advisory_xact_lock(hashtextextended(${contractId}, 27417)) IS NULL AS \\"locked\\"'
if text.count(old) != 1:
    raise RuntimeError(f'expected one advisory lock projection, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
