import type { Request } from 'express';
import { buildPublicUploadUrl } from '../src/common/public-upload-url';

function makeRequest(overrides?: Partial<Request>) {
  const headers: Record<string, string | undefined> = {
    host: 'api.local:3000',
    ...((overrides as any)?.headers ?? {}),
  };

  return {
    protocol: 'http',
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as unknown as Request;
}

describe('buildPublicUploadUrl', () => {
  const originalAssetBaseUrl = process.env.ASSET_BASE_URL;
  const originalApiPublicUrl = process.env.API_PUBLIC_URL;

  afterEach(() => {
    if (originalAssetBaseUrl === undefined) {
      delete process.env.ASSET_BASE_URL;
    } else {
      process.env.ASSET_BASE_URL = originalAssetBaseUrl;
    }

    if (originalApiPublicUrl === undefined) {
      delete process.env.API_PUBLIC_URL;
    } else {
      process.env.API_PUBLIC_URL = originalApiPublicUrl;
    }
  });

  it('normaliza caminho legado com /api/v1/uploads', () => {
    process.env.ASSET_BASE_URL = 'https://assets.example.com/';

    const req = makeRequest();
    expect(buildPublicUploadUrl(req, '/api/v1/uploads/professores/avatar.png')).toBe(
      'https://assets.example.com/uploads/professores/avatar.png'
    );
  });

  it('normaliza URL absoluta antiga com host legado', () => {
    process.env.ASSET_BASE_URL = 'https://assets.example.com';

    const req = makeRequest();
    expect(buildPublicUploadUrl(req, 'https://old-host.com/uploads/contracts/logos/logo.png')).toBe(
      'https://assets.example.com/uploads/contracts/logos/logo.png'
    );
  });

  it('usa headers forwarded como fallback quando nao ha base configurada', () => {
    delete process.env.ASSET_BASE_URL;
    delete process.env.API_PUBLIC_URL;

    const req = makeRequest({
      protocol: 'http',
      get: (name: string) => {
        const normalized = name.toLowerCase();
        if (normalized === 'x-forwarded-proto') {
          return 'https';
        }
        if (normalized === 'x-forwarded-host') {
          return 'api.example.com';
        }
        if (normalized === 'host') {
          return 'internal:3000';
        }
        return undefined;
      },
    } as unknown as Request);

    expect(buildPublicUploadUrl(req, '/uploads/alunos/avatar.png')).toBe(
      'https://api.example.com/uploads/alunos/avatar.png'
    );
  });
});