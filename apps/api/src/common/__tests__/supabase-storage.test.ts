import fs from 'fs';
import os from 'os';
import path from 'path';
import { fetch } from 'undici';
import {
  resolveR2StorageConfig,
  resolveSupabaseStorageConfig,
  savePublicAsset,
  savePublicAssetToR2,
  savePublicAssetToSupabase,
} from '../supabase-storage';

jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const originalEnv = process.env;
const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

function setSupabaseEnv() {
  process.env.ASSET_STORAGE_PROVIDER = 'supabase';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.SUPABASE_STORAGE_BUCKET = 'sistema-acesso-assets';
  process.env.ASSET_PUBLIC_BASE_URL =
    'https://example.supabase.co/storage/v1/object/public/sistema-acesso-assets';
}

function setR2Env() {
  process.env.ASSET_STORAGE_PROVIDER = 'r2';
  process.env.R2_ACCOUNT_ID = 'r2-account-id';
  process.env.R2_BUCKET = 'sistema-acesso-assets';
  process.env.R2_ACCESS_KEY_ID = 'r2-access-key-id';
  process.env.R2_SECRET_ACCESS_KEY = 'r2-secret-access-key';
  process.env.R2_PUBLIC_BASE_URL = 'https://assets.example.com';
}

beforeEach(() => {
  process.env = { ...originalEnv };
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue({ ok: true, text: async () => '' } as any);
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Public asset storage', () => {
  it('fails with a clear error when required Supabase env vars are missing', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => resolveSupabaseStorageConfig()).toThrow(
      'Variavel de ambiente obrigatoria ausente: SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  it('rejects SUPABASE_URL values that include /rest/v1/', () => {
    setSupabaseEnv();
    process.env.SUPABASE_URL = 'https://example.supabase.co/rest/v1/';

    expect(() => resolveSupabaseStorageConfig()).toThrow(
      'SUPABASE_URL deve ser a URL raiz do projeto, sem /rest/v1/'
    );
  });

  it('uploads the in-memory buffer and returns the public Supabase URL', async () => {
    setSupabaseEnv();

    const result = await savePublicAssetToSupabase({
      folder: 'alunos',
      buffer: pngBuffer,
      originalName: 'avatar aluno.png',
      mimeType: 'image/png',
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [uploadUrl, options] = mockedFetch.mock.calls[0];
    expect(uploadUrl).toEqual(
      expect.stringMatching(
        /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sistema-acesso-assets\/alunos\/\d+-[\w-]+-avatar_aluno\.png$/
      )
    );
    expect(options).toMatchObject({
      method: 'POST',
      body: pngBuffer,
      headers: {
        Authorization: 'Bearer service-role-secret',
        'Content-Type': 'image/png',
        'Cache-Control': '3600',
        'x-upsert': 'false',
      },
    });
    expect(result.path).toEqual(expect.stringMatching(/^alunos\/\d+-[\w-]+-avatar_aluno\.png$/));
    expect(result.url).toBe(
      `https://example.supabase.co/storage/v1/object/public/sistema-acesso-assets/${result.path}`
    );
  });

  it('fails with a clear error when required R2 env vars are missing', () => {
    process.env.ASSET_STORAGE_PROVIDER = 'r2';
    process.env.R2_ACCOUNT_ID = 'r2-account-id';
    delete process.env.R2_BUCKET;

    expect(() => resolveR2StorageConfig()).toThrow(
      'Variaveis de ambiente obrigatorias ausentes para R2: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL'
    );
  });

  it('uploads the in-memory buffer and returns the public R2 URL', async () => {
    setR2Env();

    const result = await savePublicAssetToR2({
      folder: 'contracts/logos',
      buffer: pngBuffer,
      originalName: 'logo contrato.png',
      mimeType: 'image/png',
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [uploadUrl, options] = mockedFetch.mock.calls[0];
    expect(uploadUrl).toEqual(
      expect.stringMatching(
        /^https:\/\/r2-account-id\.r2\.cloudflarestorage\.com\/sistema-acesso-assets\/contracts\/logos\/\d+-[\w-]+-logo_contrato\.png$/
      )
    );
    expect(options).toMatchObject({
      method: 'PUT',
      body: pngBuffer,
      headers: expect.objectContaining({
        Authorization: expect.stringContaining('AWS4-HMAC-SHA256 Credential=r2-access-key-id/'),
        'cache-control': 'public, max-age=3600',
        'content-type': 'image/png',
        'x-amz-content-sha256': expect.stringMatching(/^[a-f0-9]{64}$/),
        'x-amz-date': expect.stringMatching(/^\d{8}T\d{6}Z$/),
      }),
    });
    expect(result.path).toEqual(
      expect.stringMatching(/^contracts\/logos\/\d+-[\w-]+-logo_contrato\.png$/)
    );
    expect(result.url).toBe(`https://assets.example.com/${result.path}`);
  });

  it('keeps local filesystem behavior when the provider is not supabase or r2', async () => {
    const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'));
    process.env.ASSET_STORAGE_PROVIDER = 'local';
    process.env.ASSET_BASE_URL = 'https://api.example.com';
    process.env.UPLOAD_STORAGE_ROOT = uploadRoot;

    const result = await savePublicAsset({
      folder: 'professores',
      buffer: pngBuffer,
      originalName: 'professor.png',
      mimeType: 'image/png',
    });

    expect(result.path).toEqual(expect.stringMatching(/^uploads\/professores\/\d+-professor\.png$/));
    expect(result.url).toBe(`https://api.example.com/${result.path}`);
    expect(fs.existsSync(path.join(uploadRoot, 'professores'))).toBe(true);
  });
});
