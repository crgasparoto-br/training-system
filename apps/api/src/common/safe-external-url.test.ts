import { parseSafeExternalHttpsUrl } from './safe-external-url.js';

describe('parseSafeExternalHttpsUrl', () => {
  it.each([
    'https://svc-user:persistent-secret@example.com/base?token=abc#frag',
    'https://svc-user@example.com/base',
    'https://svc%2Duser:p%40ss@example.com/base',
  ])('rejeita HTTPS com credenciais embutidas: %s', (raw) => {
    expect(parseSafeExternalHttpsUrl(raw)).toBeNull();
  });

  it('aceita HTTPS sem credenciais e preserva a URL para sanitização do consumidor', () => {
    const url = parseSafeExternalHttpsUrl('https://example.com/base?token=abc#frag');
    expect(url?.protocol).toBe('https:');
    expect(url?.username).toBe('');
    expect(url?.password).toBe('');
  });

  it('rejeita protocolos não HTTPS', () => {
    expect(parseSafeExternalHttpsUrl('http://example.com')).toBeNull();
  });
});
