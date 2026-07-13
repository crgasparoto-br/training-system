import { useEffect, useMemo, useState } from 'react';
import type {
  ServiceCatalogImpact,
  ServiceCatalogSummary,
} from '@corrida/types';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { serviceCatalogService } from '../../services/service.service';
import ServicesCatalog from './ServicesCatalog';
import {
  buildServiceCatalogImpactItems,
  getServiceCatalogImpactSummary,
} from './serviceCatalogImpactPresentation';

const selectClassName =
  'flex h-11 w-full rounded-xl border border-[#cbd5e1] bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2';

function readError(error: any, fallback: string) {
  return error?.response?.data?.error || error?.message || fallback;
}

export default function ServicesCatalogAuditPage() {
  const [services, setServices] = useState<ServiceCatalogSummary[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [impact, setImpact] = useState<ServiceCatalogImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const loadServices = async () => {
    try {
      const items = await serviceCatalogService.listCatalog(true);
      setServices(items);
      setSelectedServiceId((current) => current || items[0]?.id || '');
    } catch (loadError) {
      setError(readError(loadError, 'Não foi possível carregar os serviços para auditoria.'));
    }
  };

  const loadImpact = async (serviceId = selectedServiceId) => {
    if (!serviceId) {
      setImpact(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setImpact(await serviceCatalogService.getCatalogImpact(serviceId));
    } catch (loadError) {
      setImpact(null);
      setError(readError(loadError, 'Não foi possível calcular o impacto deste serviço.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    if (selectedServiceId) loadImpact(selectedServiceId);
  }, [selectedServiceId]);

  const impactItems = impact ? buildServiceCatalogImpactItems(impact) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                Auditoria de impacto do catálogo
              </CardTitle>
              <CardDescription>
                Revise onde o serviço já é usado antes de inativar, recategorizar ou alterar sua composição.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => loadImpact()}
              disabled={!selectedServiceId || loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar impacto
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label htmlFor="service-impact-selection" className="mb-2 block text-sm font-medium">
                Serviço analisado
              </label>
              <select
                id="service-impact-selection"
                className={selectClassName}
                value={selectedServiceId}
                onChange={(event) => setSelectedServiceId(event.target.value)}
              >
                {services.length === 0 && <option value="">Nenhum serviço disponível</option>}
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} {service.isActive ? '' : '(inativo)'}
                  </option>
                ))}
              </select>
            </div>
            {selectedService && (
              <div className="rounded-lg border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
                Código: <strong className="text-foreground">{selectedService.code}</strong>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
              Calculando referências do serviço...
            </div>
          ) : impact ? (
            <>
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  impact.totalReferences > 0
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  {impact.totalReferences > 0 ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <p>{getServiceCatalogImpactSummary(impact)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {impactItems.map((item) => (
                  <div key={item.key} className="rounded-lg border bg-background px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              {impact.options.some((option) => option.affectedPlans > 0) && (
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold text-foreground">Opções usadas por planos ativos</p>
                  <div className="mt-3 space-y-2">
                    {impact.options
                      .filter((option) => option.affectedPlans > 0)
                      .map((option) => (
                        <div
                          key={option.optionId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                        >
                          <span>
                            {option.optionName} {!option.isActive && '(inativa)'}
                          </span>
                          <strong>{option.affectedPlans} plano(s) ativo(s)</strong>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <ServicesCatalog />
    </div>
  );
}
