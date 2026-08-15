import { resolveDeliveryTransition } from './notification-delivery-status.service.js';

describe('notification delivery state machine', () => {
  it('permite confirmação/falha após aceitação e torna estados terminais idempotentes', () => {
    expect(resolveDeliveryTransition(undefined, 'accepted')).toBe('apply');
    expect(resolveDeliveryTransition('accepted', 'sent')).toBe('apply');
    expect(resolveDeliveryTransition('accepted', 'failed')).toBe('apply');
    expect(resolveDeliveryTransition('sent', 'sent')).toBe('duplicate');
    expect(resolveDeliveryTransition('sent', 'failed')).toBe('ignore');
    expect(resolveDeliveryTransition('failed', 'accepted')).toBe('ignore');
  });
});
