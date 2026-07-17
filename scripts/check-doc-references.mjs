import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT_MARKDOWN_FILES = ['README.md', 'AGENTS.md', 'ARCHITECTURE.md'];
const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', 'dist', 'coverage']);

function walkMarkdownFiles(directory, files = []) {
  if (!existsSync(directory)) return files;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;

    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(absolutePath);
    }
  }

  return files;
}

export function collectDocumentationMarkdownFiles(root) {
  const files = walkMarkdownFiles(join(root, 'docs'));

  for (const filename of ROOT_MARKDOWN_FILES) {
    const absolutePath = join(root, filename);
    if (existsSync(absolutePath)) files.push(absolutePath);
  }

  return files.sort();
}

function stripFencedCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

function normalizeTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  }

  const titleSeparator = target.search(/\s+["']/);
  if (titleSeparator >= 0) target = target.slice(0, titleSeparator);

  target = target.split('#', 1)[0].split('?', 1)[0];
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function isExternalOrAnchor(target) {
  return (
    target.length === 0 ||
    target.startsWith('#') ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.startsWith('//')
  );
}

function extractReferences(content) {
  const searchableContent = stripFencedCodeBlocks(content);
  const references = [];
  const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const inlineDocsPathPattern = /`(docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_.-]+)?)`/g;

  for (const match of searchableContent.matchAll(markdownLinkPattern)) {
    references.push({ rawTarget: match[1], index: match.index, kind: 'markdown-link' });
  }

  for (const match of searchableContent.matchAll(inlineDocsPathPattern)) {
    references.push({ rawTarget: match[1], index: match.index, kind: 'inline-doc-path' });
  }

  return references;
}

function resolveReference(root, sourceFile, target) {
  if (target.startsWith('/')) return resolve(root, target.slice(1));
  if (target.startsWith('docs/')) return resolve(root, target);
  return resolve(dirname(sourceFile), target);
}

function isInsideRoot(root, targetPath) {
  const relativePath = relative(root, targetPath);
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..');
}

export function findBrokenMarkdownReferences(root, markdownFiles = collectDocumentationMarkdownFiles(root)) {
  const errors = [];

  for (const sourceFile of markdownFiles) {
    const content = readFileSync(sourceFile, 'utf8');

    for (const reference of extractReferences(content)) {
      const target = normalizeTarget(reference.rawTarget);
      if (isExternalOrAnchor(target)) continue;

      const targetPath = resolveReference(root, sourceFile, target);
      const sourcePath = relative(root, sourceFile).replaceAll(sep, '/');
      const displayTarget = target.replaceAll(sep, '/');
      const line = lineNumberAt(content, reference.index);

      if (!isInsideRoot(root, targetPath)) {
        errors.push(`${sourcePath}:${line} referencia fora do repositorio: ${displayTarget}`);
        continue;
      }

      if (!existsSync(targetPath)) {
        errors.push(`${sourcePath}:${line} referencia local inexistente: ${displayTarget}`);
        continue;
      }

      if (target.endsWith('/') && !statSync(targetPath).isDirectory()) {
        errors.push(`${sourcePath}:${line} deveria apontar para diretorio: ${displayTarget}`);
      }
    }
  }

  return errors;
}
