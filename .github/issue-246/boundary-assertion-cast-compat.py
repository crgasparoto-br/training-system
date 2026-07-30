from pathlib import Path

script = Path('scripts/verify-adipometry-persistence-boundaries.sh')
content = script.read_text()
old = '''      AND ("calculationSnapshot" #>> '{profileCriteria,ageYears}') = 30'''
new = '''      AND ("calculationSnapshot" #>> '{profileCriteria,ageYears}')::NUMERIC = 30::NUMERIC'''
count = content.count(old)
if count != 1:
    raise RuntimeError(f'boundary age assertion anchor mismatch: expected 1, got {count}')
script.write_text(content.replace(old, new, 1))
