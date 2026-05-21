import { describe, expect, it } from 'vitest';
import { resolveAssetUrl } from './assetUrl';

describe('resolveAssetUrl', () => {
  it('normaliza URL antiga com host incorreto em http', () => {
    const result = resolveAssetUrl('http://old-host.com/uploads/contracts/logos/1234-image.png');

    expect(result).toContain('/uploads/contracts/logos/1234-image.png');
  });

  it('normaliza URL antiga com host incorreto em https', () => {
    const result = resolveAssetUrl('https://staging-api.com/uploads/professores/5678-avatar.jpg');

    expect(result).toContain('/uploads/professores/5678-avatar.jpg');
  });

  it('usa a origin atual quando VITE_API_URL nao estiver disponivel', () => {
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          origin: 'https://app.sistemaacesso.com.br',
        },
      },
      configurable: true,
    });

    try {
      expect(resolveAssetUrl('/uploads/contracts/logos/1234-image.png')).toBe(
        'https://app.sistemaacesso.com.br/uploads/contracts/logos/1234-image.png'
      );
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });

  it('preserva URL com /uploads absoluto', () => {
    expect(resolveAssetUrl('/uploads/contracts/logos/1234-image.png')).toContain(
      '/uploads/contracts/logos/1234-image.png'
    );
  });

  it('normaliza URL com uploads relativo', () => {
    expect(resolveAssetUrl('uploads/contracts/logos/1234-image.png')).toContain(
      '/uploads/contracts/logos/1234-image.png'
    );
  });

  it('mantem URL externa sem /uploads', () => {
    expect(resolveAssetUrl('https://external.com/image.png')).toBe(
      'https://external.com/image.png'
    );
  });

  it('mantem data URL', () => {
    expect(resolveAssetUrl('data:image/png;base64,iVBORw0KG...')).toBe(
      'data:image/png;base64,iVBORw0KG...'
    );
  });

  it('mantem blob URL', () => {
    expect(resolveAssetUrl('blob:http://localhost:5173/123456')).toBe(
      'blob:http://localhost:5173/123456'
    );
  });

  it('retorna vazio para null', () => {
    expect(resolveAssetUrl(null)).toBe('');
  });

  it('retorna vazio para undefined', () => {
    expect(resolveAssetUrl(undefined)).toBe('');
  });

  it('retorna vazio para whitespace only', () => {
    expect(resolveAssetUrl('   ')).toBe('');
  });
});
