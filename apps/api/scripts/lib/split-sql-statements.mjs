export function splitSqlStatements(sql) {
  const statements = [];
  let statementStart = 0;
  let state = 'normal';
  let dollarTag = null;
  let blockCommentDepth = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];

    if (state === 'line-comment') {
      if (character === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      if (character === '/' && nextCharacter === '*') {
        blockCommentDepth += 1;
        index += 1;
      } else if (character === '*' && nextCharacter === '/') {
        blockCommentDepth -= 1;
        index += 1;
        if (blockCommentDepth === 0) state = 'normal';
      }
      continue;
    }

    if (state === 'single-quote') {
      if (character === "'" && nextCharacter === "'") {
        index += 1;
      } else if (character === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double-quote') {
      if (character === '"' && nextCharacter === '"') {
        index += 1;
      } else if (character === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
        state = 'normal';
      }
      continue;
    }

    if (character === '-' && nextCharacter === '-') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      state = 'block-comment';
      blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (character === "'") {
      state = 'single-quote';
      continue;
    }
    if (character === '"') {
      state = 'double-quote';
      continue;
    }
    if (character === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        state = 'dollar-quote';
        index += tag.length - 1;
        continue;
      }
    }
    if (character === ';') {
      const statement = sql.slice(statementStart, index + 1).trim();
      if (statement) statements.push(statement);
      statementStart = index + 1;
    }
  }

  if (state !== 'normal' && state !== 'line-comment') {
    throw new Error(`SQL terminou dentro do estado ${state}`);
  }

  const trailingSql = sql.slice(statementStart).trim();
  if (trailingSql && !trailingSql.startsWith('--') && !trailingSql.startsWith('/*')) {
    throw new Error('SQL possui conteúdo sem ponto e vírgula no final');
  }

  return statements;
}
