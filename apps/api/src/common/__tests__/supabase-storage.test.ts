import fs from 'fs';
import os from 'os';
import path from 'path';
import { fetch } from 'undici';
import {
  resolveSupabaseStorageConfig,
  savePublicAsset,
  savePublicAssetToSupabase,
} from '../supabase-storage';

jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const originalEnv = process.env;

function setSupabaseEnv() {
  process.env.ASSET_STORAGE_PROVIDER = 'supabase';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.SUPABASE_STORAGE_BUCKET = 'sistema-acesso-assets';
  process.env.ASSET_PUBLIC_BASE_URL =
    'https://example.supabase.co/storage/v1/object/public/sistema-acesso-assets';
}

beforeEach(() => {
  process.env = { ...originalEnv };
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue({ ok: true, text: async () => '' } as any);
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Supabase public asset storage', () => {
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
    const buffer = Buffer.from('image-bytes');

    const result = await savePublicAssetToSupabase({
      folder: 'alunos',
      buffer,
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
      body: buffer,
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

  it('keeps local filesystem behavior when the provider is not supabase', async () => {
    process.env.ASSET_STORAGE_PROVIDER = 'local';
    process.env.ASSET_BASE_URL = 'https://api.example.com';
    process.env.UPLOAD_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'));

    const result = await savePublicAsset({
      folder: 'professores',
      buffer: Buffer.from('local-image'),
      originalName: 'professor.png',
      mimeType: 'image/png',
    });

    expect(result.path).toEqual(expect.stringMatching(/^uploads\/professores\/\d+-professor\.png$/));
    expect(result.url).toBe(`https://api.example.com/${result.path}`);
    expect(fs.existsSync(path.join(process.env.UPLOAD_STORAGE_ROOT, 'professores'))).toBe(true);
  });
});
