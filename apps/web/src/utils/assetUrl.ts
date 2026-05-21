function normalizeAssetBaseUrl(baseUrl: string) {
  return baseUrl
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '');
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

function extractUploadsPath(url: string): string | null {
  const match = url.match(/\/uploads\/.+/i);
  return match ? match[0] : null;
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

    return trimmedValue;
  }

  if (/^\/?uploads\//i.test(trimmedValue)) {
    const normalizedPath = trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
    return assetBaseUrl ? `${assetBaseUrl}${normalizedPath}` : normalizedPath;
  }

  return trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
}
