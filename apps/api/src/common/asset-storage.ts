import fs from 'fs';
import path from 'path';

const DEFAULT_UPLOADS_DIRECTORY = 'uploads';

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

function stripApiUploadsPrefix(value: string) {
  return value.replace(/^\/?api\/v\d+\//i, '/').replace(/^\/+/, '/');
}

export function getUploadStorageRoot() {
  const configuredRoot = process.env.UPLOAD_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  return path.resolve(process.cwd(), DEFAULT_UPLOADS_DIRECTORY);
}

export function resolveUploadStoragePath(...segments: string[]) {
  return path.join(getUploadStorageRoot(), ...segments);
}

export function ensureUploadStorageDir(...segments: string[]) {
  const absoluteDir = resolveUploadStoragePath(...segments);
  fs.mkdirSync(absoluteDir, { recursive: true });
  return absoluteDir;
}

export function sanitizeUploadFileName(originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return safeName.length > 0 ? safeName : 'file';
}

export function buildTimestampedUploadFileName(originalName: string) {
  return `${Date.now()}-${sanitizeUploadFileName(originalName)}`;
}

export function resolvePublicUploadPath(...segments: string[]) {
  const normalized = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

  return `/uploads/${normalized}`;
}

export function resolveStoredUploadPathFromAbsolute(absolutePath: string) {
  const storageRoot = getUploadStorageRoot();
  const relativeToStorageRoot = path.relative(storageRoot, absolutePath);

  if (!relativeToStorageRoot.startsWith('..') && !path.isAbsolute(relativeToStorageRoot)) {
    return toPosixPath(path.posix.join('uploads', relativeToStorageRoot));
  }

  return toPosixPath(path.relative(process.cwd(), absolutePath));
}

export function resolveUploadAbsolutePathFromStored(storedPath: string) {
  const trimmed = storedPath.trim();
  const normalized = stripApiUploadsPrefix(trimmed);

  if (/^\/?uploads\//i.test(normalized)) {
    const relativeToUploads = normalized.replace(/^\/?uploads\//i, '');
    return resolveUploadStoragePath(relativeToUploads);
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  return path.resolve(process.cwd(), storedPath);
}