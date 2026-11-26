import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ephemeral loopback certificate only. Pin its public key in Chromium instead
// of disabling certificate verification for the real YouTube connection.
export function createLoopbackTls() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'library-browser-tls-'));
  try {
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
      '-keyout', keyPath, '-out', certPath,
    ], { stdio: 'ignore' });
    const key = readFileSync(keyPath);
    const cert = readFileSync(certPath);
    const spki = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
    const pin = createHash('sha256').update(spki).digest('base64');
    return { options: { key, cert }, chromeArg: '--ignore-certificate-errors-spki-list=' + pin };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
