import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as any,
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: any }) => unknown) => selector({ user: mocks.user }),
}));

import { BrowserFavicon, SYSTEM_FAVICON_FALLBACK } from './BrowserFavicon';

function faviconLink() {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

describe('BrowserFavicon', () => {
  beforeEach(() => {
    mocks.user = null;
    document.head.innerHTML = '<link rel="icon" type="image/jpeg" href="/logo.jpg" />';
  });

  afterEach(() => {
    cleanup();
  });

  it('mantem um fallback estatico valido no HTML inicial e remove a referencia do Vite', () => {
    const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    expect(indexHtml).toContain(`href="${SYSTEM_FAVICON_FALLBACK}"`);
    expect(indexHtml).not.toContain('/vite.svg');
  });

  it('usa o logo cadastrado da empresa quando o contexto autenticado esta disponivel', () => {
    mocks.user = {
      professor: {
        contract: {
          logoUrl: 'https://cdn.example.com/empresa-a.png',
        },
      },
    };

    render(<BrowserFavicon />);

    expect(faviconLink()?.getAttribute('href')).toBe('https://cdn.example.com/empresa-a.png');
    expect(faviconLink()?.hasAttribute('type')).toBe(false);
  });

  it('acompanha a troca de empresa ou logo sem hard reload', () => {
    mocks.user = {
      professor: {
        contract: {
          logoUrl: 'https://cdn.example.com/empresa-a.png',
        },
      },
    };

    const view = render(<BrowserFavicon />);
    expect(faviconLink()?.getAttribute('href')).toBe('https://cdn.example.com/empresa-a.png');

    mocks.user = {
      professor: {
        contract: {
          logoUrl: 'https://cdn.example.com/empresa-b.png',
        },
      },
    };
    view.rerender(<BrowserFavicon />);

    expect(faviconLink()?.getAttribute('href')).toBe('https://cdn.example.com/empresa-b.png');
  });

  it('restaura o fallback quando o logo e removido do contexto autenticado', () => {
    mocks.user = {
      professor: {
        contract: {
          logoUrl: 'https://cdn.example.com/empresa-a.png',
        },
      },
    };

    const view = render(<BrowserFavicon />);
    expect(faviconLink()?.getAttribute('href')).toBe('https://cdn.example.com/empresa-a.png');

    mocks.user = {
      professor: {
        contract: {
          logoUrl: null,
        },
      },
    };
    view.rerender(<BrowserFavicon />);

    expect(faviconLink()?.getAttribute('href')).toBe(SYSTEM_FAVICON_FALLBACK);
    expect(faviconLink()?.getAttribute('type')).toBe('image/jpeg');
  });

  it('cria o link de favicon com fallback se o documento nao tiver um', () => {
    document.head.innerHTML = '';

    render(<BrowserFavicon />);

    expect(faviconLink()?.getAttribute('href')).toBe(SYSTEM_FAVICON_FALLBACK);
  });
});
