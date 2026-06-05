import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fetch } from 'undici';
import {
  buildTimestampedUploadFileName,
  ensureUploadStorageDir,
  resolvePublicUploadPath,
  sanitizeUploadFileName,
} from './asset-storage.js';

export type PublicAssetFolder = 'alunos' | 'professores' | 'contracts/logos';

type SavePublicAssetInput = {
  folder: PublicAssetFolder;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

type SavedPublicAsset = {
  path: string;
  url: string;
};

type SupabaseStorageConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function joinPublicUrl(baseUrl: string, assetPath: string) {
  const encodedPath = assetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${normalizeBaseUrl(baseUrl)}/${encodedPath}`;
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return value;
}

export function getAssetStorageProvider() {
  return process.env.ASSET_STORAGE_PROVIDER?.trim().toLowerCase() || 'local';
}

export function resolveSupabaseStorageConfig(): SupabaseStorageConfig {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');

  if (/\/rest\/v1\/?$/i.test(supabaseUrl)) {
    throw new Error('SUPABASE_URL deve ser a URL raiz do projeto, sem /rest/v1/');
  }

  return {
    supabaseUrl: normalizeBaseUrl(supabaseUrl),
    serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    bucket: getRequiredEnv('SUPABASE_STORAGE_BUCKET'),
    publicBaseUrl: normalizeBaseUrl(getRequiredEnv('ASSET_PUBLIC_BASE_URL')),
  };
}

function buildUniqueAssetPath(folder: PublicAssetFolder, originalName: string) {
  const extension = path.extname(originalName);
  const baseName = sanitizeUploadFileName(path.basename(originalName, extension));
  const safeExtension = sanitizeUploadFileName(extension.replace(/^\./, ''));
  const suffix = safeExtension ? `.${safeExtension}` : '';

  return `${folder}/${Date.now()}-${randomUUID()}-${baseName}${suffix}`;
}

async function savePublicAssetToLocal(input: SavePublicAssetInput): Promise<SavedPublicAsset> {
  const segments = input.folder.split('/');
  const filename = buildTimestampedUploadFileName(input.originalName);
  const absoluteDir = ensureUploadStorageDir(...segments);
  const absolutePath = path.join(absoluteDir, filename);
  const publicPath = resolvePublicUploadPath(...segments, filename);
  const configuredBaseUrl = process.env.ASSET_BASE_URL || process.env.API_PUBLIC_URL || '';

  await fs.promises.writeFile(absolutePath, input.buffer);

  return {
    path: publicPath.replace(/^\//, ''),
    url: configuredBaseUrl ? `${normalizeBaseUrl(configuredBaseUrl)}${publicPath}` : publicPath,
  };
}

export async function savePublicAssetToSupabase(input: SavePublicAssetInput): Promise<SavedPublicAsset> {
  const config = resolveSupabaseStorageConfig();
  const assetPath = buildUniqueAssetPath(input.folder, input.originalName);
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${config.bucket}/${assetPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: input.buffer,
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': input.mimeType,
      'Cache-Control': '3600',
      'x-upsert': 'false',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Erro ao enviar arquivo para o Supabase Storage');
  }

  return {
    path: assetPath,
    url: joinPublicUrl(config.publicBaseUrl, assetPath),
  };
}

export async function savePublicAsset(input: SavePublicAssetInput): Promise<SavedPublicAsset> {
  if (getAssetStorageProvider() === 'supabase') {
    return savePublicAssetToSupabase(input);
  }

  return savePublicAssetToLocal(input);
}
