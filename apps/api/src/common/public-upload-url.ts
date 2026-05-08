import type { Request } from 'express';

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

function normalizeUploadPath(uploadPath: string) {
  return uploadPath.startsWith('/') ? uploadPath : `/${uploadPath}`;
}

export function buildPublicUploadUrl(req: Request, uploadPath: string) {
  const normalizedPath = normalizeUploadPath(uploadPath);
  const configuredBaseUrl = process.env.ASSET_BASE_URL || process.env.API_PUBLIC_URL;

  if (configuredBaseUrl) {
    return `${normalizeBaseUrl(configuredBaseUrl)}${normalizedPath}`;
  }

  const forwardedProto = req
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = req
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();

  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');

  if (!host) {
    return null;
  }

  return `${protocol}://${host}${normalizedPath}`;
}