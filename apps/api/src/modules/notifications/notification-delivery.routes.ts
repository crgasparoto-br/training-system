import { createPublicKey, verify } from 'node:crypto';
import express, { type Router } from 'express';
import twilio from 'twilio';
import {
  notificationDeliveryStatusService,
  type ExternalDeliveryEvent,
} from './notification-delivery-status.service.js';

const router: Router = express.Router();
const MAX_SENDGRID_CLOCK_SKEW_SECONDS = 300;
const NOTIFICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const resolveCallbackBaseUrl = () => {
  const raw = process.env.NOTIFICATION_CALLBACK_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

const parseSendGridPublicKey = (value: string) => {
  if (value.includes('BEGIN PUBLIC KEY')) return createPublicKey(value);
  return createPublicKey({
    key: Buffer.from(value, 'base64'),
    format: 'der',
    type: 'spki',
  });
};

export const verifySendGridEventWebhook = (
  body: Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
  publicKey: string | undefined,
  nowMs = Date.now()
) => {
  if (!timestamp || !signature || !publicKey) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > MAX_SENDGRID_CLOCK_SKEW_SECONDS) {
    return false;
  }

  try {
    const signedPayload = Buffer.concat([Buffer.from(timestamp, 'utf8'), body]);
    return verify(
      'sha256',
      signedPayload,
      parseSendGridPublicKey(publicKey),
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
};

export const mapSendGridEventStatus = (
  eventName: string
): ExternalDeliveryEvent['status'] | null => {
  const normalized = eventName.trim().toLowerCase();
  if (normalized === 'delivered') return 'sent';
  if (normalized === 'bounce' || normalized === 'dropped') return 'failed';
  if (normalized === 'processed' || normalized === 'deferred') return 'accepted';
  return null;
};

export const mapTwilioMessageStatus = (
  providerStatus: string
): ExternalDeliveryEvent['status'] | null => {
  const normalized = providerStatus.trim().toLowerCase();
  if (normalized === 'delivered' || normalized === 'read') return 'sent';
  if (normalized === 'failed' || normalized === 'undelivered') return 'failed';
  if (
    normalized === 'accepted' ||
    normalized === 'queued' ||
    normalized === 'sending' ||
    normalized === 'sent'
  ) {
    return 'accepted';
  }
  return null;
};

const getNotificationId = (value: unknown) =>
  typeof value === 'string' && NOTIFICATION_ID_PATTERN.test(value) ? value : null;

router.post(
  '/sendgrid-events',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const timestamp = req.header('x-twilio-email-event-webhook-timestamp') ?? undefined;
    const signature = req.header('x-twilio-email-event-webhook-signature') ?? undefined;
    const publicKey = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY?.trim();

    if (!verifySendGridEventWebhook(rawBody, timestamp, signature, publicKey)) {
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    let events: unknown;
    try {
      events = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    for (const item of events) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const event = item as Record<string, unknown>;
      const notificationId = getNotificationId(
        event.notificationId ??
          (event.custom_args && typeof event.custom_args === 'object'
            ? (event.custom_args as Record<string, unknown>).notificationId
            : null)
      );
      const eventName = typeof event.event === 'string' ? event.event : '';
      const status = mapSendGridEventStatus(eventName);
      if (!notificationId || !status) continue;

      await notificationDeliveryStatusService.apply({
        notificationId,
        channel: 'email',
        status,
        providerStatus: eventName.trim().toLowerCase(),
        providerMessageId: typeof event.sg_message_id === 'string' ? event.sg_message_id : null,
        error: status === 'failed' ? `SendGrid informou ${eventName.trim().toLowerCase()}` : null,
      });
    }

    return res.status(204).end();
  }
);

router.post(
  '/twilio-status',
  express.urlencoded({ extended: false, limit: '64kb' }),
  async (req, res) => {
    const notificationId = getNotificationId(req.query.notificationId);
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const callbackBase = resolveCallbackBaseUrl();
    const signature = req.header('x-twilio-signature');

    if (!notificationId || !authToken || !callbackBase || !signature) {
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    const requestUrl = new URL(req.originalUrl, callbackBase).toString();
    const params = Object.fromEntries(
      Object.entries(req.body ?? {}).map(([key, value]) => [key, String(value)])
    );
    if (!twilio.validateRequest(authToken, signature, requestUrl, params)) {
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    const providerStatus = typeof req.body?.MessageStatus === 'string' ? req.body.MessageStatus : '';
    const status = mapTwilioMessageStatus(providerStatus);
    if (!status) return res.status(204).end();

    const errorCode = typeof req.body?.ErrorCode === 'string' ? req.body.ErrorCode : null;
    await notificationDeliveryStatusService.apply({
      notificationId,
      channel: 'whatsapp',
      status,
      providerStatus: providerStatus.trim().toLowerCase(),
      providerMessageId: typeof req.body?.MessageSid === 'string' ? req.body.MessageSid : null,
      error:
        status === 'failed'
          ? `Twilio informou ${providerStatus.trim().toLowerCase()}${errorCode ? ` (${errorCode})` : ''}`
          : null,
    });

    return res.status(204).end();
  }
);

export const notificationDeliveryWebhookRoutes = router;
