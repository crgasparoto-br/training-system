export const parseSafeExternalHttpsUrl = (raw: string | null | undefined): URL | null => {
  const normalized = raw?.trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
};
