function normalizeAssetBaseUrl(baseUrl: string) {
  return baseUrl
    .replace(/\/+$/, '')
    .replace(/\/api\/v\d+$/i, '');
}

function getAssetBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_URL;

  if (configuredBaseUrl) {
    return normalizeAssetBaseUrl(configuredBaseUrl);
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeAssetBaseUrl(window.location.origin);
  }

  return '';
}

function normalizeUploadsPath(path: string) {
  return path
    .replace(/^\/?api\/v\d+\//i, '/')
    .replace(/^\/?uploads\//i, '/uploads/');
}

function extractUploadsPath(url: string): string | null {
  const match = url.match(/\/?(?:api\/v\d+\/)?uploads\/.+/i);
  return match ? normalizeUploadsPath(match[0]) : null;
}

export function resolveAssetUrl(value?: string | null) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return '';
  }

  if (/^(data:|blob:)/i.test(trimmedValue)) {
    return trimmedValue;
  }

  const assetBaseUrl = getAssetBaseUrl();

  if (/^https?:\/\//i.test(trimmedValue)) {
    const uploadsPath = extractUploadsPath(trimmedValue);

    if (uploadsPath && assetBaseUrl) {
      return `${assetBaseUrl}${uploadsPath}`;
    }

    return uploadsPath || trimmedValue;
  }

  if (/^\/?(?:api\/v\d+\/)?uploads\//i.test(trimmedValue)) {
    const normalizedPath = normalizeUploadsPath(trimmedValue);
    return assetBaseUrl ? `${assetBaseUrl}${normalizedPath}` : normalizedPath;
  }

  return trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
}
