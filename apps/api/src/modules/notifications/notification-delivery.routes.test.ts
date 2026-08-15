import { generateKeyPairSync, sign } from 'node:crypto';
import {
  mapSendGridEventStatus,
  mapTwilioMessageStatus,
  verifySendGridEventWebhook,
} from './notification-delivery.routes.js';

const toBase64DerPublicKey = (key: ReturnType<typeof generateKeyPairSync>['publicKey']) =>
  key.export({ type: 'spki', format: 'der' }).toString('base64');

describe('notification delivery webhook controls', () => {
  it('verifica assinatura SendGrid sobre timestamp + corpo bruto e rejeita adulteração/replay', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const timestamp = '1786824000';
    const body = Buffer.from('[{"event":"delivered","notificationId":"n-1"}]');
    const signature = sign(
      'sha256',
      Buffer.concat([Buffer.from(timestamp), body]),
      privateKey
    ).toString('base64');
    const publicKeyValue = toBase64DerPublicKey(publicKey);
    const nowMs = Number(timestamp) * 1000;

    expect(
      verifySendGridEventWebhook(body, timestamp, signature, publicKeyValue, nowMs)
    ).toBe(true);
    expect(
      verifySendGridEventWebhook(
        Buffer.from('[{"event":"dropped","notificationId":"n-1"}]'),
        timestamp,
        signature,
        publicKeyValue,
        nowMs
      )
    ).toBe(false);
    expect(
      verifySendGridEventWebhook(body, timestamp, signature, publicKeyValue, nowMs + 301_000)
    ).toBe(false);
  });

  it('mapeia estados intermediários e terminais sem tratar aceitação como entrega', () => {
    expect(mapSendGridEventStatus('processed')).toBe('accepted');
    expect(mapSendGridEventStatus('deferred')).toBe('accepted');
    expect(mapSendGridEventStatus('delivered')).toBe('delivered');
    expect(mapSendGridEventStatus('bounce')).toBe('failed');

    expect(mapTwilioMessageStatus('queued')).toBe('accepted');
    expect(mapTwilioMessageStatus('sent')).toBe('accepted');
    expect(mapTwilioMessageStatus('delivered')).toBe('delivered');
    expect(mapTwilioMessageStatus('read')).toBe('delivered');
    expect(mapTwilioMessageStatus('undelivered')).toBe('failed');
  });
});
