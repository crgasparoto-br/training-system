import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  publishServiceCatalogMutation,
  SERVICE_CATALOG_MUTATION_EVENT,
  subscribeServiceCatalogMutation,
} from './service-catalog-events';

describe('service catalog mutation events', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('notifies subscribers after a successful catalog mutation', () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const unsubscribe = subscribeServiceCatalogMutation(listener);

    publishServiceCatalogMutation({
      kind: 'option',
      resourceId: 'option-1',
      serviceId: 'service-1',
    });
    vi.runAllTimers();

    expect(listener).toHaveBeenCalledWith({
      kind: 'option',
      resourceId: 'option-1',
      serviceId: 'service-1',
    });

    unsubscribe();
  });

  it('allows the listener to be removed without reloading the page', () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const unsubscribe = subscribeServiceCatalogMutation(listener);
    unsubscribe();

    window.dispatchEvent(
      new CustomEvent(SERVICE_CATALOG_MUTATION_EVENT, {
        detail: { kind: 'service', resourceId: 'service-1' },
      })
    );
    vi.runAllTimers();

    expect(listener).not.toHaveBeenCalled();
  });
});
