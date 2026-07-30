from pathlib import Path

script = Path('scripts/verify-adipometry-no-textual-maturation-inference.sh')
content = script.read_text()
replacements = [
    (
        '  completion_definition TEXT;\n',
        '  completion_definition TEXT;\n  profile_validation_definition TEXT;\n',
        'declaration',
    ),
    (
        '''  SELECT PG_GET_FUNCTIONDEF('"canonicalizeAdipometryCompletion"()'::REGPROCEDURE)
    INTO completion_definition;

  IF completion_definition LIKE '%population,maturationCriteria%' THEN''',
        '''  SELECT PG_GET_FUNCTIONDEF('"canonicalizeAdipometryCompletion"()'::REGPROCEDURE)
    INTO completion_definition;

  SELECT PG_GET_FUNCTIONDEF('"validateAdipometryCanonicalProtocolProfile"()'::REGPROCEDURE)
    INTO profile_validation_definition;

  IF completion_definition LIKE '%population,maturationCriteria%'
     OR profile_validation_definition LIKE '%population,maturationCriteria%' THEN''',
        'function inspection',
    ),
    (
        "    RAISE EXCEPTION 'negative-control failed: completion still consumes descriptive maturation text';",
        "    RAISE EXCEPTION 'negative-control failed: executable validation still consumes descriptive maturation text';",
        'negative message',
    ),
    (
        "  IF completion_definition NOT LIKE '%population,maturationRule%' THEN",
        "  IF profile_validation_definition NOT LIKE '%population,maturationRule%' THEN",
        'structured rule owner',
    ),
    (
        "    RAISE EXCEPTION 'positive-control failed: completion does not consume the structured maturation rule';",
        "    RAISE EXCEPTION 'positive-control failed: profile validation does not consume the structured maturation rule';",
        'positive message',
    ),
    (
        'echo "positive-control OK: explicit structured NOT_REQUIRED rule remains valid and drives completion"',
        'echo "positive-control OK: explicit structured NOT_REQUIRED rule remains valid and drives profile validation"',
        'success message',
    ),
]
for old, new, label in replacements:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label} anchor mismatch: expected 1, got {count}')
    content = content.replace(old, new, 1)
script.write_text(content)
