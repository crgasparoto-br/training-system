import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { serviceCatalogService } from './service.service';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const getMock = vi.mocked(api.get);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function apiResponse<T>(data: T) {
  return { data: { success: true, data } } as any;
}

describe('serviceCatalogService connection pressure', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('coalesces simultaneous identical catalog requests', async () => {
    const pending = deferred<any>();
    getMock.mockReturnValueOnce(pending.promise as any);

    const first = serviceCatalogService.listCatalog(true);
    const second = serviceCatalogService.listCatalog(true);

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/services/catalog?includeInactive=true');

    pending.resolve(apiResponse([]));

    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([]);
  });

  it('limits catalog detail reads to two simultaneous requests', async () => {
    const pending = [deferred<any>(), deferred<any>(), deferred<any>()];
    let requestIndex = 0;
    let activeRequests = 0;
    let maximumActiveRequests = 0;

    getMock.mockImplementation(() => {
      const current = pending[requestIndex++];
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      return current.promise.finally(() => {
        activeRequests -= 1;
      });
    });

    const first = serviceCatalogService.getCatalogDetail('service-1');
    const second = serviceCatalogService.getCatalogDetail('service-2');
    const third = serviceCatalogService.getCatalogDetail('service-3');

    expect(getMock).toHaveBeenCalledTimes(2);

    pending[0].resolve(apiResponse({ id: 'service-1' }));
    await expect(first).resolves.toEqual({ id: 'service-1' });
    await Promise.resolve();

    expect(getMock).toHaveBeenCalledTimes(3);

    pending[1].resolve(apiResponse({ id: 'service-2' }));
    pending[2].resolve(apiResponse({ id: 'service-3' }));

    await expect(second).resolves.toEqual({ id: 'service-2' });
    await expect(third).resolves.toEqual({ id: 'service-3' });
    expect(maximumActiveRequests).toBe(2);
  });
});
