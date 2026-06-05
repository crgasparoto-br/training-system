import path from 'path';
import {
  buildTimestampedUploadFileName,
  getUploadStorageRoot,
  resolvePublicUploadPath,
  resolveStoredUploadPathFromAbsolute,
  resolveUploadAbsolutePathFromStored,
} from '../src/common/asset-storage';

describe('asset-storage', () => {
  const originalUploadStorageRoot = process.env.UPLOAD_STORAGE_ROOT;

  afterEach(() => {
    if (originalUploadStorageRoot === undefined) {
      delete process.env.UPLOAD_STORAGE_ROOT;
      return;
    }

    process.env.UPLOAD_STORAGE_ROOT = originalUploadStorageRoot;
  });

  it('usa uploads relativo ao cwd quando UPLOAD_STORAGE_ROOT nao estiver configurado', () => {
    delete process.env.UPLOAD_STORAGE_ROOT;

    expect(getUploadStorageRoot()).toBe(path.resolve(process.cwd(), 'uploads'));
  });

  it('resolve raiz configurada para caminho absoluto', () => {
    process.env.UPLOAD_STORAGE_ROOT = './.tmp/uploads-persist';

    expect(getUploadStorageRoot()).toBe(path.resolve('./.tmp/uploads-persist'));
  });

  it('sanitiza nome de arquivo com prefixo de timestamp', () => {
    const result = buildTimestampedUploadFileName('logo oficial (1).png');

    expect(result).toMatch(/^\d+-logo_oficial_1_.png$/);
  });

  it('monta caminho publico padrao em /uploads', () => {
    expect(resolvePublicUploadPath('professores', 'contracts', 'arquivo.pdf')).toBe(
      '/uploads/professores/contracts/arquivo.pdf'
    );
  });

  it('persiste caminho relativo padrao quando arquivo esta dentro do storage root', () => {
    process.env.UPLOAD_STORAGE_ROOT = '/var/data/uploads';

    const storedPath = resolveStoredUploadPathFromAbsolute('/var/data/uploads/contracts/logos/logo.png');
    expect(storedPath).toBe('uploads/contracts/logos/logo.png');
  });

  it('resolve caminho absoluto a partir de /api/v1/uploads legado', () => {
    process.env.UPLOAD_STORAGE_ROOT = '/var/data/uploads';

    const absolutePath = resolveUploadAbsolutePathFromStored('/api/v1/uploads/alunos/avatar.png');
    expect(absolutePath).toBe(path.join('/var/data/uploads', 'alunos', 'avatar.png'));
  });
});