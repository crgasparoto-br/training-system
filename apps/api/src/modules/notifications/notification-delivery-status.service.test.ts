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

  it('não permite que persistência inicial atrasada regrida confirmação terminal do callback', () => {
    expect(resolveDeliveryTransition('sent', 'accepted')).toBe('ignore');
    expect(resolveDeliveryTransition('failed', 'accepted')).toBe('ignore');
    expect(resolveDeliveryTransition('sent', 'not_configured')).toBe('ignore');
    expect(resolveDeliveryTransition('failed', 'skipped')).toBe('ignore');
  });

  it('não permite degradar uma tentativa já aceita para estados locais mais fracos', () => {
    expect(resolveDeliveryTransition('accepted', 'not_configured')).toBe('ignore');
    expect(resolveDeliveryTransition('accepted', 'skipped')).toBe('ignore');
    expect(resolveDeliveryTransition('not_configured', 'accepted')).toBe('apply');
    expect(resolveDeliveryTransition('skipped', 'accepted')).toBe('apply');
  });
});
