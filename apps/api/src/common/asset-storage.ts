import path from 'path';

const DEFAULT_UPLOADS_DIRECTORY = 'uploads';

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
