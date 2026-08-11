function compactSql(statement) {
  return statement
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
    .toUpperCase();
}

const legacySignatures = [
  '"CREATEADIPOMETRYDRAFT"(TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE)',
  '"CREATEADIPOMETRYDRAFT"(TEXT,TEXT,TEXT,TEXT,DATE,TIMESTAMP WITH TIME ZONE)',
];

export function isLegacyAdipometryPrivilegeMutation(statement) {
  const sql = compactSql(statement);
  return (
    sql.startsWith('REVOKE ') &&
    sql.includes(' ON FUNCTION ') &&
    legacySignatures.some((signature) => sql.includes(signature)) &&
    (sql.endsWith(' FROM PUBLIC;') || sql.endsWith(' FROM CURRENT_USER;'))
  );
}

function isPrivilegeMutation(statement) {
  const sql = compactSql(statement);
  return sql.startsWith('REVOKE ') || sql.startsWith('GRANT ');
}

export function isAdipometryAuditTablePrivilegeMutation(statement) {
  return (
    compactSql(statement) ===
    'REVOKE INSERT ON TABLE "ADIPOMETRYAUDITEVENT" FROM PUBLIC;'
  );
}

function assertTransactional(statements, migrationName) {
  if (statements[0] !== 'BEGIN;' || statements.at(-1) !== 'COMMIT;') {
    throw new Error(`${migrationName} não está integralmente protegida por BEGIN/COMMIT`);
  }
}

export function getCompatibleAuditRemediationStatements(statements, migrationName) {
  assertTransactional(statements, migrationName);
  const innerStatements = statements.slice(1, -1);
  const privilegeMutations = innerStatements.filter(isLegacyAdipometryPrivilegeMutation);

  if (privilegeMutations.length !== 2) {
    throw new Error(
      `${migrationName} deveria conter exatamente 2 REVOKEs legados conhecidos; encontrou ${privilegeMutations.length}`
    );
  }

  return innerStatements.filter((statement) => !isLegacyAdipometryPrivilegeMutation(statement));
}

export function assertAclOnlyLegacyMigration(statements, migrationName) {
  assertTransactional(statements, migrationName);
  const innerStatements = statements.slice(1, -1);

  if (
    innerStatements.length !== 4 ||
    !innerStatements.every(isLegacyAdipometryPrivilegeMutation)
  ) {
    throw new Error(
      `${migrationName} deixou de ser uma migration exclusivamente de ACL conhecida`
    );
  }
}

export function getCompatiblePersistenceBypassStatements(statements, migrationName) {
  assertTransactional(statements, migrationName);
  const innerStatements = statements.slice(1, -1);
  const privilegeMutations = innerStatements.filter(isPrivilegeMutation);

  if (
    privilegeMutations.length !== 1 ||
    !isAdipometryAuditTablePrivilegeMutation(privilegeMutations[0])
  ) {
    throw new Error(
      `${migrationName} deveria conter exatamente 1 REVOKE de INSERT conhecido`
    );
  }

  return innerStatements.filter((statement) => !isAdipometryAuditTablePrivilegeMutation(statement));
}

export function assertTerminalLegacyOverloadGuard(statements, migrationName) {
  assertTransactional(statements, migrationName);
  const innerStatements = statements.slice(1, -1);

  if (innerStatements.length !== 2) {
    throw new Error(`${migrationName} deveria conter exatamente 2 guards legados`);
  }

  const compactStatements = innerStatements.map(compactSql);
  const timestampGuard = compactStatements.find((sql) =>
    sql.includes('P_ASSESSMENT_DATE TIMESTAMP(3)')
  );
  const dateGuard = compactStatements.find((sql) =>
    sql.includes('P_ASSESSMENT_DATE DATE')
  );

  for (const sql of [timestampGuard, dateGuard]) {
    if (
      !sql ||
      !sql.startsWith('CREATE OR REPLACE FUNCTION "CREATEADIPOMETRYDRAFT"(') ||
      !sql.includes("RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';") ||
      /\b(INSERT|UPDATE|DELETE|MERGE)\b/.test(sql)
    ) {
      throw new Error(
        `${migrationName} não mantém os overloads legados em modo fail-closed`
      );
    }
  }
}
