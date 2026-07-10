import { useEffect, useMemo, useState } from 'react';
import type {
  ServiceCatalogDetail,
  ServiceCatalogSummary,
  ServiceCategory,
  ServiceCommercialOption,
  ServicePlanComponent,
  ServicePresentationItem,
  ServicePriceType,
} from '@corrida/types';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Edit3,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { serviceCatalogService } from '../../services/service.service';
import {
  filterCatalog,
  formatCatalogPrice,
  SERVICE_CATEGORY_LABELS,
} from './serviceCatalogPresentation';

const selectClassName =
  'flex h-11 w-full rounded-xl border border-[#cbd5e1] bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2';
const textareaClassName =
  'flex min-h-[110px] w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2';

const emptyServiceForm = {
  name: '',
  code: '',
  category: 'individual_service' as ServiceCategory,
  summary: '',
  whatIs: '',
  targetAudience: '',
  displayOrder: '0',
  isActive: true,
};

const emptyOptionForm = {
  id: '',
  name: '',
  code: '',
  frequency: '',
  quantity: '',
  unit: '',
  priceType: 'fixed' as ServicePriceType,
  priceAmount: '',
  validFrom: '',
  validUntil: '',
  isActive: true,
};

const emptyPresentationForm = { id: '', text: '', isActive: true };
const emptyComponentForm = {
  id: '',
  targetKind: 'service' as 'service' | 'option',
  ownerServiceId: '',
  targetId: '',
  quantity: '',
  unit: '',
  notes: '',
  isActive: true,
};

function readError(error: any, fallback: string) {
  return error?.response?.data?.error || error?.message || fallback;
}

function parseOptionalNumber(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function swap<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        active
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-slate-200 text-slate-700'
      }`}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function OrderActions({
  index,
  length,
  onMove,
}: {
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className="rounded-md border p-1 disabled:opacity-30"
        aria-label="Mover para cima"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="rounded-md border p-1 disabled:opacity-30"
        aria-label="Mover para baixo"
        disabled={index === length - 1}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ServicesCatalog() {
  const [tab, setTab] = useState<'catalog' | 'pricing'>('catalog');
  const [items, setItems] = useState<ServiceCatalogSummary[]>([]);
  const [pricingDetails, setPricingDetails] = useState<Record<string, ServiceCatalogDetail>>({});
  const [loading, setLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ServiceCategory | 'all'>('all');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServiceCatalogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [optionForm, setOptionForm] = useState(emptyOptionForm);
  const [presentationForm, setPresentationForm] = useState(emptyPresentationForm);
  const [componentForm, setComponentForm] = useState(emptyComponentForm);
  const [componentOptions, setComponentOptions] = useState<ServiceCommercialOption[]>([]);

  const filteredItems = useMemo(
    () => filterCatalog(items, search, category, status),
    [items, search, category, status]
  );

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await serviceCatalogService.listCatalog(true));
    } catch (loadError) {
      setError(readError(loadError, 'Não foi possível carregar o catálogo.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, [dirty]);

  useEffect(() => {
    if (tab !== 'pricing' || items.length === 0) return;
    const missing = items.filter((item) => !pricingDetails[item.id]);
    if (missing.length === 0) return;

    setPricingLoading(true);
    Promise.all(missing.map((item) => serviceCatalogService.getCatalogDetail(item.id)))
      .then((details) => {
        setPricingDetails((current) => ({
          ...current,
          ...Object.fromEntries(details.map((item) => [item.id, item])),
        }));
      })
      .catch((loadError) => setError(readError(loadError, 'Não foi possível carregar os valores.')))
      .finally(() => setPricingLoading(false));
  }, [tab, items, pricingDetails]);

  const fillServiceForm = (item: ServiceCatalogDetail) => {
    setServiceForm({
      name: item.name,
      code: item.code,
      category: item.category,
      summary: item.summary || '',
      whatIs: item.whatIs || '',
      targetAudience: item.targetAudience || '',
      displayOrder: String(item.displayOrder),
      isActive: item.isActive,
    });
  };

  const openCreate = () => {
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return;
    setSelectedId(null);
    setDetail(null);
    setServiceForm({ ...emptyServiceForm, displayOrder: String(items.length) });
    setOptionForm(emptyOptionForm);
    setPresentationForm(emptyPresentationForm);
    setComponentForm(emptyComponentForm);
    setDirty(false);
    setEditorOpen(true);
    setError(null);
  };

  const openDetail = async (id: string) => {
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return;
    setEditorOpen(true);
    setSelectedId(id);
    setDetailLoading(true);
    setError(null);
    try {
      const loaded = await serviceCatalogService.getCatalogDetail(id);
      setDetail(loaded);
      fillServiceForm(loaded);
      setOptionForm(emptyOptionForm);
      setPresentationForm(emptyPresentationForm);
      setComponentForm(emptyComponentForm);
      setDirty(false);
    } catch (loadError) {
      setError(readError(loadError, 'Não foi possível abrir o serviço.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeEditor = () => {
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return;
    setEditorOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDirty(false);
  };

  const refreshDetail = async (id = selectedId) => {
    if (!id) return;
    const loaded = await serviceCatalogService.getCatalogDetail(id);
    setDetail(loaded);
    fillServiceForm(loaded);
    setPricingDetails((current) => ({ ...current, [loaded.id]: loaded }));
    setDirty(false);
  };

  const saveService = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: serviceForm.name,
        code: serviceForm.code,
        category: serviceForm.category,
        summary: serviceForm.summary || null,
        whatIs: serviceForm.whatIs || null,
        targetAudience: serviceForm.targetAudience || null,
        displayOrder: Number(serviceForm.displayOrder || 0),
        isActive: serviceForm.isActive,
      };

      if (detail && detail.category !== serviceForm.category) {
        const confirmed = window.confirm(
          'A categoria será alterada. Opções e componentes existentes não serão excluídos. Deseja continuar?'
        );
        if (!confirmed) return;
      }

      const saved = selectedId
        ? await serviceCatalogService.updateCatalogService(selectedId, payload)
        : await serviceCatalogService.createCatalogService(payload);
      setSelectedId(saved.id);
      setDetail(saved);
      fillServiceForm(saved);
      setDirty(false);
      setNotice('Serviço salvo com sucesso.');
      await loadItems();
    } catch (saveError) {
      setError(readError(saveError, 'Não foi possível salvar o serviço. Os dados digitados foram preservados.'));
    } finally {
      setSaving(false);
    }
  };

  const editOption = (option: ServiceCommercialOption) => {
    setOptionForm({
      id: option.id,
      name: option.name,
      code: option.code,
      frequency: option.frequency || '',
      quantity: option.quantity === null || option.quantity === undefined ? '' : String(option.quantity),
      unit: option.unit || '',
      priceType: option.priceType,
      priceAmount:
        option.priceAmount === null || option.priceAmount === undefined
          ? ''
          : option.priceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      validFrom: dateInput(option.validFrom),
      validUntil: dateInput(option.validUntil),
      isActive: option.isActive,
    });
  };

  const saveOption = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const amount = parseOptionalNumber(optionForm.priceAmount);
      const payload = {
        name: optionForm.name,
        code: optionForm.code,
        frequency: optionForm.frequency || null,
        quantity: parseOptionalNumber(optionForm.quantity) ?? null,
        unit: optionForm.unit || null,
        priceType: optionForm.priceType,
        priceAmount: optionForm.priceType === 'fixed' ? amount : null,
        validFrom: optionForm.validFrom || null,
        validUntil: optionForm.validUntil || null,
        isActive: optionForm.isActive,
      };
      if (optionForm.id) {
        await serviceCatalogService.updateCommercialOption(optionForm.id, payload);
      } else {
        await serviceCatalogService.createCommercialOption(selectedId, {
          ...payload,
          frequency: payload.frequency || undefined,
          quantity: payload.quantity || undefined,
          unit: payload.unit || undefined,
          priceAmount: payload.priceAmount || undefined,
          validFrom: payload.validFrom || undefined,
          validUntil: payload.validUntil || undefined,
        });
      }
      setOptionForm(emptyOptionForm);
      await refreshDetail();
      await loadItems();
      setNotice('Opção comercial salva com sucesso.');
    } catch (saveError) {
      setError(readError(saveError, 'Não foi possível salvar a opção comercial.'));
    } finally {
      setSaving(false);
    }
  };

  const savePresentationItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      if (presentationForm.id) {
        await serviceCatalogService.updatePresentationItem(presentationForm.id, {
          text: presentationForm.text,
          isActive: presentationForm.isActive,
        });
      } else {
        await serviceCatalogService.createPresentationItem(selectedId, {
          text: presentationForm.text,
          isActive: presentationForm.isActive,
        });
      }
      setPresentationForm(emptyPresentationForm);
      await refreshDetail();
      setNotice('Item de apresentação salvo com sucesso.');
    } catch (saveError) {
      setError(readError(saveError, 'Não foi possível salvar o item.'));
    } finally {
      setSaving(false);
    }
  };

  const loadComponentOptions = async (serviceId: string) => {
    setComponentOptions([]);
    if (!serviceId) return;
    try {
      const target = await serviceCatalogService.getCatalogDetail(serviceId);
      setComponentOptions(target.options.filter((option) => option.isActive));
    } catch (loadError) {
      setError(readError(loadError, 'Não foi possível carregar as opções do serviço selecionado.'));
    }
  };

  const editComponent = async (component: ServicePlanComponent) => {
    const ownerServiceId = component.targetOption?.serviceId || component.targetServiceId || '';
    if (component.targetOptionId && ownerServiceId) await loadComponentOptions(ownerServiceId);
    setComponentForm({
      id: component.id,
      targetKind: component.targetOptionId ? 'option' : 'service',
      ownerServiceId,
      targetId: component.targetOptionId || component.targetServiceId || '',
      quantity: component.quantity === null || component.quantity === undefined ? '' : String(component.quantity),
      unit: component.unit || '',
      notes: component.notes || '',
      isActive: component.isActive,
    });
  };

  const saveComponent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        targetServiceId: componentForm.targetKind === 'service' ? componentForm.targetId : null,
        targetOptionId: componentForm.targetKind === 'option' ? componentForm.targetId : null,
        quantity: parseOptionalNumber(componentForm.quantity) ?? null,
        unit: componentForm.unit || null,
        notes: componentForm.notes || null,
        isActive: componentForm.isActive,
      };
      if (componentForm.id) {
        await serviceCatalogService.updatePlanComponent(componentForm.id, payload);
      } else {
        await serviceCatalogService.createPlanComponent(selectedId, {
          targetServiceId: payload.targetServiceId || undefined,
          targetOptionId: payload.targetOptionId || undefined,
          quantity: payload.quantity || undefined,
          unit: payload.unit || undefined,
          notes: payload.notes || undefined,
          isActive: payload.isActive,
        });
      }
      setComponentForm(emptyComponentForm);
      setComponentOptions([]);
      await refreshDetail();
      await loadItems();
      setNotice('Componente salvo com sucesso.');
    } catch (saveError) {
      setError(readError(saveError, 'Não foi possível salvar o componente.'));
    } finally {
      setSaving(false);
    }
  };

  const reorderOptions = async (index: number, direction: -1 | 1) => {
    if (!detail) return;
    const ordered = swap(detail.options, index, direction);
    if (ordered === detail.options) return;
    try {
      await serviceCatalogService.reorderCommercialOptions(detail.id, { ids: ordered.map((item) => item.id) });
      await refreshDetail();
    } catch (moveError) {
      setError(readError(moveError, 'Não foi possível reordenar as opções. A ordem anterior foi mantida.'));
    }
  };

  const reorderPresentation = async (index: number, direction: -1 | 1) => {
    if (!detail) return;
    const ordered = swap(detail.presentationItems, index, direction);
    if (ordered === detail.presentationItems) return;
    try {
      await serviceCatalogService.reorderPresentationItems(detail.id, { ids: ordered.map((item) => item.id) });
      await refreshDetail();
    } catch (moveError) {
      setError(readError(moveError, 'Não foi possível reordenar os itens. A ordem anterior foi mantida.'));
    }
  };

  const reorderComponents = async (index: number, direction: -1 | 1) => {
    if (!detail) return;
    const ordered = swap(detail.components, index, direction);
    if (ordered === detail.components) return;
    try {
      await serviceCatalogService.reorderPlanComponents(detail.id, { ids: ordered.map((item) => item.id) });
      await refreshDetail();
    } catch (moveError) {
      setError(readError(moveError, 'Não foi possível reordenar os componentes. A ordem anterior foi mantida.'));
    }
  };

  const runBootstrap = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const simulation = await serviceCatalogService.bootstrapReferenceCatalog(true);
      const summary = `${simulation.createdServices.length} serviço(s), ${simulation.createdOptions.length} opção(ões), ${simulation.createdPresentationItems} item(ns) e ${simulation.createdComponents} componente(s) serão criados. ${simulation.conflicts.length} conflito(s) exigem revisão.`;
      if (!window.confirm(`${summary}\n\nExecutar a carga agora?`)) return;
      const result = await serviceCatalogService.bootstrapReferenceCatalog(false);
      setNotice(
        `Carga concluída: ${result.createdServices.length} serviço(s) e ${result.createdOptions.length} opção(ões) criados. Alterações existentes foram preservadas.`
      );
      setPricingDetails({});
      await loadItems();
    } catch (bootstrapError) {
      setError(readError(bootstrapError, 'Não foi possível executar a carga inicial.'));
    } finally {
      setSaving(false);
    }
  };

  if (editorOpen) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={closeEditor}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao catálogo
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedId ? 'Detalhes do serviço' : 'Novo serviço'}</h1>
              <p className="text-sm text-muted-foreground">Organize conteúdo, opções comerciais e composição em seções separadas.</p>
            </div>
          </div>
          {detail && <StatusBadge active={detail.isActive} />}
        </div>

        {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {detailLoading ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Carregando detalhes...</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Visão geral e apresentação</CardTitle>
                <CardDescription>Defina como o serviço será encontrado e compreendido no catálogo.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={saveService}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Nome" value={serviceForm.name} onChange={(event) => { setServiceForm((current) => ({ ...current, name: event.target.value })); setDirty(true); }} required />
                    <Input label="Código estável" value={serviceForm.code} onChange={(event) => { setServiceForm((current) => ({ ...current, code: event.target.value })); setDirty(true); }} required />
                    <div>
                      <label className="mb-2 block text-sm font-medium">Categoria</label>
                      <select className={selectClassName} value={serviceForm.category} onChange={(event) => { setServiceForm((current) => ({ ...current, category: event.target.value as ServiceCategory })); setDirty(true); }}>
                        <option value="assessment">Avaliação ou consulta</option>
                        <option value="individual_service">Serviço individual</option>
                        <option value="combined_plan">Plano combinado</option>
                      </select>
                    </div>
                    <Input label="Ordem comercial" type="number" min="0" value={serviceForm.displayOrder} onChange={(event) => { setServiceForm((current) => ({ ...current, displayOrder: event.target.value })); setDirty(true); }} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Resumo para o catálogo</label>
                    <textarea className={textareaClassName} value={serviceForm.summary} onChange={(event) => { setServiceForm((current) => ({ ...current, summary: event.target.value })); setDirty(true); }} />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium">O que é?</label>
                      <textarea className={textareaClassName} value={serviceForm.whatIs} onChange={(event) => { setServiceForm((current) => ({ ...current, whatIs: event.target.value })); setDirty(true); }} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">A quem se destina?</label>
                      <textarea className={textareaClassName} value={serviceForm.targetAudience} onChange={(event) => { setServiceForm((current) => ({ ...current, targetAudience: event.target.value })); setDirty(true); }} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={serviceForm.isActive} onChange={(event) => { setServiceForm((current) => ({ ...current, isActive: event.target.checked })); setDirty(true); }} /> Serviço ativo no catálogo</label>
                  <Button type="submit" isLoading={saving}>Salvar visão geral</Button>
                </form>
              </CardContent>
            </Card>

            {detail && (
              <>
                <Card>
                  <CardHeader><CardTitle>O que o compõe?</CardTitle><CardDescription>Lista textual apresentada ao cliente. Ela não substitui a composição relacional do plano.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    {detail.presentationItems.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p> : detail.presentationItems.map((item, index) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                        <div><p className="text-sm">{item.text}</p><StatusBadge active={item.isActive} /></div>
                        <div className="flex gap-2"><OrderActions index={index} length={detail.presentationItems.length} onMove={(direction) => reorderPresentation(index, direction)} /><button type="button" className="rounded-md border p-2" aria-label="Editar item" onClick={() => setPresentationForm({ id: item.id, text: item.text, isActive: item.isActive })}><Edit3 className="h-4 w-4" /></button></div>
                      </div>
                    ))}
                    <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={savePresentationItem}>
                      <Input label="Item de apresentação" value={presentationForm.text} onChange={(event) => setPresentationForm((current) => ({ ...current, text: event.target.value }))} required />
                      <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" checked={presentationForm.isActive} onChange={(event) => setPresentationForm((current) => ({ ...current, isActive: event.target.checked }))} /> Ativo</label>
                      <div className="mt-6"><Button type="submit" isLoading={saving}>{presentationForm.id ? 'Atualizar item' : 'Adicionar item'}</Button></div>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Opções e preços</CardTitle><CardDescription>Configure preço, frequência, vigência e status de cada forma de contratação.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    {detail.options.length === 0 ? <p className="text-sm text-muted-foreground">Este serviço ainda não possui opção comercial.</p> : detail.options.map((option, index) => (
                      <div key={option.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                        <div><p className="font-medium">{option.name}</p><p className="text-sm text-muted-foreground">{option.priceType === 'fixed' && typeof option.priceAmount === 'number' ? option.priceAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : option.priceType === 'free' ? 'Gratuito' : 'Sob consulta'}{option.frequency ? ` · ${option.frequency}` : ''}</p><StatusBadge active={option.isActive} /></div>
                        <div className="flex gap-2"><OrderActions index={index} length={detail.options.length} onMove={(direction) => reorderOptions(index, direction)} /><button type="button" className="rounded-md border p-2" aria-label="Editar opção" onClick={() => editOption(option)}><Edit3 className="h-4 w-4" /></button></div>
                      </div>
                    ))}
                    <form className="space-y-4 rounded-xl bg-muted/30 p-4" onSubmit={saveOption}>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Input label="Nome comercial" value={optionForm.name} onChange={(event) => setOptionForm((current) => ({ ...current, name: event.target.value }))} required />
                        <Input label="Código" value={optionForm.code} onChange={(event) => setOptionForm((current) => ({ ...current, code: event.target.value }))} required />
                        <div><label className="mb-2 block text-sm font-medium">Tipo de preço</label><select className={selectClassName} value={optionForm.priceType} onChange={(event) => setOptionForm((current) => ({ ...current, priceType: event.target.value as ServicePriceType, priceAmount: event.target.value === 'fixed' ? current.priceAmount : '' }))}><option value="fixed">Preço fixo</option><option value="free">Gratuito</option><option value="on_request">Sob consulta</option></select></div>
                        {optionForm.priceType === 'fixed' && <Input label="Valor" inputMode="decimal" value={optionForm.priceAmount} onChange={(event) => setOptionForm((current) => ({ ...current, priceAmount: event.target.value }))} required />}
                        <Input label="Frequência" value={optionForm.frequency} onChange={(event) => setOptionForm((current) => ({ ...current, frequency: event.target.value }))} />
                        <Input label="Quantidade" type="number" min="0.01" step="0.01" value={optionForm.quantity} onChange={(event) => setOptionForm((current) => ({ ...current, quantity: event.target.value }))} />
                        <Input label="Unidade/periodicidade" value={optionForm.unit} onChange={(event) => setOptionForm((current) => ({ ...current, unit: event.target.value }))} />
                        <Input label="Vigência inicial" type="date" value={optionForm.validFrom} onChange={(event) => setOptionForm((current) => ({ ...current, validFrom: event.target.value }))} />
                        <Input label="Vigência final" type="date" value={optionForm.validUntil} onChange={(event) => setOptionForm((current) => ({ ...current, validUntil: event.target.value }))} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={optionForm.isActive} onChange={(event) => setOptionForm((current) => ({ ...current, isActive: event.target.checked }))} /> Opção ativa</label><Button type="submit" isLoading={saving}>{optionForm.id ? 'Atualizar opção' : 'Adicionar opção'}</Button>{optionForm.id && <Button type="button" variant="outline" onClick={() => setOptionForm(emptyOptionForm)}>Cancelar edição</Button>}</div>
                    </form>
                  </CardContent>
                </Card>

                {detail.category === 'combined_plan' && (
                  <Card>
                    <CardHeader><CardTitle>Composição relacional do plano</CardTitle><CardDescription>Relacione serviços ou opções do mesmo contrato. Ciclos são bloqueados pela API.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                      {detail.components.length === 0 && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><CircleAlert className="h-4 w-4" /> Plano sem componente ativo.</div>}
                      {detail.components.map((component, index) => (
                        <div key={component.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{component.targetOption?.name || component.targetService?.name || 'Destino indisponível'}</p><p className="text-sm text-muted-foreground">{component.quantity ? `${component.quantity} ` : ''}{component.unit || ''}{component.notes ? ` · ${component.notes}` : ''}</p><StatusBadge active={component.isActive} /></div><div className="flex gap-2"><OrderActions index={index} length={detail.components.length} onMove={(direction) => reorderComponents(index, direction)} /><button type="button" className="rounded-md border p-2" aria-label="Editar componente" onClick={() => editComponent(component)}><Edit3 className="h-4 w-4" /></button></div></div>
                      ))}
                      <form className="space-y-4 rounded-xl bg-muted/30 p-4" onSubmit={saveComponent}>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          <div><label className="mb-2 block text-sm font-medium">Tipo de destino</label><select className={selectClassName} value={componentForm.targetKind} onChange={(event) => { const targetKind = event.target.value as 'service' | 'option'; setComponentForm((current) => ({ ...current, targetKind, targetId: '', ownerServiceId: '' })); setComponentOptions([]); }}><option value="service">Serviço</option><option value="option">Opção comercial</option></select></div>
                          {componentForm.targetKind === 'service' ? <div><label className="mb-2 block text-sm font-medium">Serviço incluído</label><select className={selectClassName} value={componentForm.targetId} onChange={(event) => setComponentForm((current) => ({ ...current, targetId: event.target.value }))} required><option value="">Selecione</option>{items.filter((item) => item.id !== detail.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div> : <><div><label className="mb-2 block text-sm font-medium">Serviço da opção</label><select className={selectClassName} value={componentForm.ownerServiceId} onChange={(event) => { setComponentForm((current) => ({ ...current, ownerServiceId: event.target.value, targetId: '' })); loadComponentOptions(event.target.value); }} required><option value="">Selecione</option>{items.filter((item) => item.id !== detail.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className="mb-2 block text-sm font-medium">Opção incluída</label><select className={selectClassName} value={componentForm.targetId} onChange={(event) => setComponentForm((current) => ({ ...current, targetId: event.target.value }))} required><option value="">Selecione</option>{componentOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div></>}
                          <Input label="Quantidade" type="number" min="0.01" step="0.01" value={componentForm.quantity} onChange={(event) => setComponentForm((current) => ({ ...current, quantity: event.target.value }))} />
                          <Input label="Unidade/periodicidade" value={componentForm.unit} onChange={(event) => setComponentForm((current) => ({ ...current, unit: event.target.value }))} />
                          <Input label="Observação" value={componentForm.notes} onChange={(event) => setComponentForm((current) => ({ ...current, notes: event.target.value }))} />
                        </div>
                        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={componentForm.isActive} onChange={(event) => setComponentForm((current) => ({ ...current, isActive: event.target.checked }))} /> Componente ativo</label><Button type="submit" isLoading={saving}>{componentForm.id ? 'Atualizar componente' : 'Adicionar componente'}</Button>{componentForm.id && <Button type="button" variant="outline" onClick={() => setComponentForm(emptyComponentForm)}>Cancelar edição</Button>}</div>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Catálogo comercial de serviços</h1><p className="text-sm text-muted-foreground">Organize serviços, avaliações, planos, opções, valores e conteúdo de apresentação.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={loadItems} disabled={loading || saving}><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button><Button type="button" variant="outline" onClick={runBootstrap} isLoading={saving}>Carregar referência ACESSO 2026</Button><Button type="button" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Novo serviço</Button></div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <div role="tablist" aria-label="Áreas do catálogo" className="flex gap-2 border-b">
        <button type="button" role="tab" aria-selected={tab === 'catalog'} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === 'catalog' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`} onClick={() => setTab('catalog')}>Catálogo</button>
        <button type="button" role="tab" aria-selected={tab === 'pricing'} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === 'pricing' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`} onClick={() => setTab('pricing')}>Combinações e valores</button>
      </div>

      {tab === 'catalog' ? (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_220px_180px_auto]">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Buscar por nome ou código" className={`${selectClassName} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou código" /></div>
              <select aria-label="Filtrar por categoria" className={selectClassName} value={category} onChange={(event) => setCategory(event.target.value as ServiceCategory | 'all')}><option value="all">Todas as categorias</option><option value="assessment">Avaliações e consultas</option><option value="individual_service">Serviços individuais</option><option value="combined_plan">Planos combinados</option></select>
              <select aria-label="Filtrar por status" className={selectClassName} value={status} onChange={(event) => setStatus(event.target.value as 'all' | 'active' | 'inactive')}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
              <Button type="button" variant="outline" onClick={() => { setSearch(''); setCategory('all'); setStatus('all'); }}>Limpar filtros</Button>
            </CardContent>
          </Card>

          {loading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando catálogo...</CardContent></Card> : items.length === 0 ? <Card><CardContent className="py-12 text-center"><p className="font-medium">O catálogo ainda está vazio.</p><p className="mt-1 text-sm text-muted-foreground">Cadastre um serviço ou carregue a referência ACESSO 2026.</p></CardContent></Card> : filteredItems.length === 0 ? <Card><CardContent className="py-12 text-center"><p className="font-medium">Nenhum serviço corresponde aos filtros.</p><Button type="button" variant="outline" onClick={() => { setSearch(''); setCategory('all'); setStatus('all'); }} className="mt-4">Limpar filtros</Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredItems.map((item) => <Card key={item.id} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SERVICE_CATEGORY_LABELS[item.category]}</p><CardTitle className="mt-1">{item.name}</CardTitle></div><StatusBadge active={item.isActive} /></div><CardDescription>{item.summary || 'Resumo ainda não informado.'}</CardDescription></CardHeader><CardContent className="mt-auto space-y-3"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">{item.activeOptionsCount} opção(ões) ativa(s)</span>{item.category === 'combined_plan' && <span className="rounded-full bg-muted px-2.5 py-1">{item.activeComponentsCount} componente(s)</span>}</div><p className="font-semibold">{formatCatalogPrice(item)}</p>{item.commercialState === 'incomplete_plan' && <p className="flex items-center gap-1 text-xs text-amber-700"><CircleAlert className="h-4 w-4" /> Cadastro incompleto</p>}<Button type="button" variant="outline" onClick={() => openDetail(item.id)} className="w-full">Ver detalhes</Button></CardContent></Card>)}</div>}
        </>
      ) : (
        <div className="space-y-6">
          {pricingLoading && <Card><CardContent className="py-10 text-center text-muted-foreground">Carregando combinações e valores...</CardContent></Card>}
          {(['assessment', 'individual_service', 'combined_plan'] as ServiceCategory[]).map((group) => {
            const groupItems = items.filter((item) => item.category === group);
            if (groupItems.length === 0) return null;
            return <section key={group} className="space-y-3"><div><h2 className="text-xl font-semibold">{SERVICE_CATEGORY_LABELS[group]}</h2><p className="text-sm text-muted-foreground">Revise opções vigentes, valores e pendências sem usar uma tabela extensa.</p></div><div className="grid gap-4 lg:grid-cols-2">{groupItems.map((item) => { const itemDetail = pricingDetails[item.id]; return <Card key={item.id}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{item.name}</CardTitle><StatusBadge active={item.isActive} /></div><CardDescription>{formatCatalogPrice(item)}</CardDescription></CardHeader><CardContent className="space-y-3">{!itemDetail ? <p className="text-sm text-muted-foreground">Carregando opções...</p> : itemDetail.options.length === 0 ? <p className="text-sm text-amber-700">Sem opção comercial cadastrada.</p> : itemDetail.options.map((option) => <div key={option.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><p className="font-medium">{option.name}</p><StatusBadge active={option.isActive} /></div><p className="text-sm text-muted-foreground">{option.priceType === 'fixed' && typeof option.priceAmount === 'number' ? option.priceAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : option.priceType === 'free' ? 'Gratuito' : 'Sob consulta'}{option.frequency ? ` · ${option.frequency}` : ''}</p>{option.validUntil && new Date(option.validUntil).getTime() < Date.now() && <p className="mt-1 text-xs text-amber-700">Preço vencido</p>}</div>)}{item.category === 'combined_plan' && item.activeComponentsCount === 0 && <p className="text-sm text-amber-700">Plano sem componente ativo.</p>}<Button type="button" variant="outline" onClick={() => openDetail(item.id)}>Editar serviço</Button></CardContent></Card>; })}</div></section>;
          })}
        </div>
      )}
    </div>
  );
}
