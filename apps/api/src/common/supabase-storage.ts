import fs from 'fs';
import path from 'path';
import { createHash, createHmac, randomUUID } from 'crypto';
import { fetch } from 'undici';
import {
  buildTimestampedUploadFileName,
  ensureUploadStorageDir,
  resolvePublicUploadPath,
  sanitizeUploadFileName,
} from './asset-storage.js';
import { assertUploadContent, normalizeUploadFileName } from './upload-validation.js';

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

type R2StorageConfig = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

const R2_REGION = 'auto';
const R2_SERVICE = 's3';
const R2_REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
] as const;

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function joinPublicUrl(baseUrl: string, assetPath: string) {
  const encodedPath = encodeAssetPath(assetPath);

  return `${normalizeBaseUrl(baseUrl)}/${encodedPath}`;
}

function encodeAssetPath(assetPath: string) {
  return assetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return value;
}

function validateAbsoluteHttpUrl(value: string, envName: string) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('invalid protocol');
    }

    return normalizeBaseUrl(value);
  } catch {
    throw new Error(`${envName} deve ser uma URL absoluta iniciando com https:// ou http://`);
  }
}

function validatePublicAssetInput(input: SavePublicAssetInput): SavePublicAssetInput {
  const detected = assertUploadContent('image', input.buffer, input.mimeType);

  return {
    ...input,
    mimeType: detected.mimeType,
    originalName: normalizeUploadFileName(input.originalName, detected.extension),
  };
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

export function resolveR2StorageConfig(): R2StorageConfig {
  const missing = R2_REQUIRED_ENV.filter((name) => !process.env[name]?.trim());

  if (missing.length) {
    throw new Error(`Variaveis de ambiente obrigatorias ausentes para R2: ${missing.join(', ')}`);
  }

  return {
    accountId: getRequiredEnv('R2_ACCOUNT_ID'),
    bucket: getRequiredEnv('R2_BUCKET'),
    accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    publicBaseUrl: validateAbsoluteHttpUrl(getRequiredEnv('R2_PUBLIC_BASE_URL'), 'R2_PUBLIC_BASE_URL'),
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

function sha256Hex(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function getR2SignatureKey(secretAccessKey: string, dateStamp: string) {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, R2_REGION);
  const kService = hmacSha256(kRegion, R2_SERVICE);

  return hmacSha256(kService, 'aws4_request');
}

function formatR2SigningDate(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function buildR2UploadTarget(config: R2StorageConfig, assetPath: string) {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeAssetPath(assetPath)}`;

  return {
    host,
    canonicalUri,
    url: `https://${host}${canonicalUri}`,
  };
}

function canonicalizeHeaders(headers: Record<string, string>) {
  return Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name].trim().replace(/\s+/g, ' ')}\n`)
    .join('');
}

function buildR2SignedHeaders(
  config: R2StorageConfig,
  method: 'PUT',
  canonicalUri: string,
  host: string,
  body: Buffer,
  mimeType: string
) {
  const payloadHash = sha256Hex(body);
  const { amzDate, dateStamp } = formatR2SigningDate();
  const signedHeaderValues = {
    'cache-control': 'public, max-age=3600',
    'content-type': mimeType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(signedHeaderValues).sort().join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalizeHeaders(signedHeaderValues),
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', getR2SignatureKey(config.secretAccessKey, dateStamp))
    .update(stringToSign)
    .digest('hex');

  return {
    Authorization: [
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
    'cache-control': signedHeaderValues['cache-control'],
    'content-type': signedHeaderValues['content-type'],
    'x-amz-content-sha256': signedHeaderValues['x-amz-content-sha256'],
    'x-amz-date': signedHeaderValues['x-amz-date'],
  };
}

export async function savePublicAssetToR2(input: SavePublicAssetInput): Promise<SavedPublicAsset> {
  const config = resolveR2StorageConfig();
  const assetPath = buildUniqueAssetPath(input.folder, input.originalName);
  const uploadTarget = buildR2UploadTarget(config, assetPath);

  const response = await fetch(uploadTarget.url, {
    method: 'PUT',
    body: input.buffer,
    headers: buildR2SignedHeaders(
      config,
      'PUT',
      uploadTarget.canonicalUri,
      uploadTarget.host,
      input.buffer,
      input.mimeType
    ),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Erro ao enviar arquivo para o Cloudflare R2');
  }

  return {
    path: assetPath,
    url: joinPublicUrl(config.publicBaseUrl, assetPath),
  };
}

export async function savePublicAsset(input: SavePublicAssetInput): Promise<SavedPublicAsset> {
  const validatedInput = validatePublicAssetInput(input);
  const provider = getAssetStorageProvider();

  if (provider === 'supabase') {
    return savePublicAssetToSupabase(validatedInput);
  }

  if (provider === 'r2') {
    return savePublicAssetToR2(validatedInput);
  }

  if (provider !== 'local') {
    throw new Error('ASSET_STORAGE_PROVIDER deve ser local, supabase ou r2');
  }

  return savePublicAssetToLocal(validatedInput);
}
