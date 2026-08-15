import { resolveDeliveryTransition } from './notification-delivery-status.service.js';

describe('notification delivery state machine', () => {
  it('permite confirmação/falha após aceitação e torna estados terminais idempotentes', () => {
    expect(resolveDeliveryTransition(undefined, 'accepted')).toBe('apply');
    expect(resolveDeliveryTransition('accepted', 'delivered')).toBe('apply');
    expect(resolveDeliveryTransition('accepted', 'failed')).toBe('apply');
    expect(resolveDeliveryTransition('delivered', 'delivered')).toBe('duplicate');
    expect(resolveDeliveryTransition('delivered', 'failed')).toBe('ignore');
    expect(resolveDeliveryTransition('failed', 'accepted')).toBe('ignore');
  });
});
