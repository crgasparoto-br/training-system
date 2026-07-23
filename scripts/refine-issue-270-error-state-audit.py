from pathlib import Path

path = Path('apps/api/scripts/visual-audit-issue-270.mjs')
source = path.read_text()
old = """  if (consoleErrors.length) {
    throw new Error(`${name}: erros no navegador: ${consoleErrors.join(' | ')}`);
  }
"""
new = """  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) =>
      !(
        scenario === 'error' &&
        message.includes('Failed to load resource') &&
        message.includes('500')
      )
  );
  if (unexpectedConsoleErrors.length) {
    throw new Error(`${name}: erros no navegador: ${unexpectedConsoleErrors.join(' | ')}`);
  }
"""
if old not in source:
    raise SystemExit('Console error block not found')
path.write_text(source.replace(old, new, 1))
