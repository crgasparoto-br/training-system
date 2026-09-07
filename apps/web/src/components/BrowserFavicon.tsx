import { useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { resolveAssetUrl } from '../utils/assetUrl';

export const SYSTEM_FAVICON_FALLBACK = '/logo.jpg';

export function setBrowserFavicon(href?: string | null) {
  const nextHref = href?.trim() || SYSTEM_FAVICON_FALLBACK;
  let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');

  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }

  favicon.setAttribute('href', nextHref);

  if (nextHref === SYSTEM_FAVICON_FALLBACK) {
    favicon.setAttribute('type', 'image/jpeg');
  } else {
    favicon.removeAttribute('type');
  }
}

export function BrowserFavicon() {
  const logoUrl = useAuthStore((state) => state.user?.professor?.contract?.logoUrl);
  const faviconHref = resolveAssetUrl(logoUrl);

  useEffect(() => {
    setBrowserFavicon(faviconHref);
  }, [faviconHref]);

  return null;
}
