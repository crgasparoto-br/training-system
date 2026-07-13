export const SERVICE_CATALOG_MUTATION_EVENT = 'service-catalog:mutation-completed';

export type ServiceCatalogMutationKind =
  | 'service'
  | 'option'
  | 'presentation'
  | 'component'
  | 'reorder'
  | 'bootstrap';

export type ServiceCatalogMutationDetail = {
  kind: ServiceCatalogMutationKind;
  resourceId?: string;
  serviceId?: string;
};

export function publishServiceCatalogMutation(detail: ServiceCatalogMutationDetail) {
  if (typeof window === 'undefined') return;

  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<ServiceCatalogMutationDetail>(SERVICE_CATALOG_MUTATION_EVENT, {
        detail,
      })
    );
  }, 0);
}

export function subscribeServiceCatalogMutation(
  listener: (detail: ServiceCatalogMutationDetail) => void
) {
  if (typeof window === 'undefined') return () => undefined;

  const handleMutation = (event: Event) => {
    listener((event as CustomEvent<ServiceCatalogMutationDetail>).detail);
  };

  window.addEventListener(SERVICE_CATALOG_MUTATION_EVENT, handleMutation);
  return () => window.removeEventListener(SERVICE_CATALOG_MUTATION_EVENT, handleMutation);
}
