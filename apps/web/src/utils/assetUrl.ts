const apiBaseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

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

  if (/^https?:\/\//i.test(trimmedValue)) {
    const uploadsPath = extractUploadsPath(trimmedValue);
    if (uploadsPath) {
      return apiBaseUrl ? `${apiBaseUrl}${uploadsPath}` : uploadsPath;
    }
    return trimmedValue;
  }

  if (/^\/?uploads\//i.test(trimmedValue)) {
    const normalizedPath = trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
    return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
  }

  return trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
}