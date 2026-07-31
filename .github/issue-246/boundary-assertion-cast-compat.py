from pathlib import Path

script = Path('scripts/verify-adipometry-persistence-boundaries.sh')
content = script.read_text()

old = '''      AND "calculationSnapshot" ->> 'implementationVersion' LIKE 'db-adipometry-protocol-v%' '''.rstrip()
new = '''      AND "calculationSnapshot" ->> 'implementationVersion' = 'db-adipometry-guedes-v1' '''.rstrip()

count = content.count(old)
if count != 1:
    raise RuntimeError(f'boundary implementation version anchor mismatch: expected 1, got {count}')

script.write_text(content.replace(old, new, 1))
