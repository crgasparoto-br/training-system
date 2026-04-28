import { useEffect, useState } from 'react';
import type { ServiceOption } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { settingsServicesCopy } from '../../i18n/ptBR';
import { serviceCatalogService } from '../../services/service.service';

const defaultForm = {
  kind: 'base' as 'base' | 'offer',
  name: '',
  description: '',
  parentServiceId: '',
  monthlyPrice: '',
  validFrom: '',
  validUntil: '',
  isActive: true,
};

const textareaClassName =
  'flex min-h-[120px] w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background placeholder:text-[#94a3b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]';

const formatCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) {
    return undefined;
  }

  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

const formatCurrencyValue = (value?: number | null) => {
  if (typeof value !== 'number') {
    return settingsServicesCopy.notInformed;
  }

  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateLabel = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('pt-BR');
};

const formatValidity = (validFrom?: string | null, validUntil?: string | null) => {
  const fromLabel = formatDateLabel(validFrom);
  const untilLabel = formatDateLabel(validUntil);

  if (fromLabel && untilLabel) {
    return `${fromLabel} a ${untilLabel}`;
  }

  if (fromLabel) {
    return `${settingsServicesCopy.validFromPrefix} ${fromLabel}`;
  }

  if (untilLabel) {
    return `${settingsServicesCopy.validUntilPrefix} ${untilLabel}`;
  }

  return settingsServicesCopy.notInformed;
};

export default function SettingsServices() {
  const [items, setItems] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const baseServiceOptions = items.filter((item) => !item.parentServiceId);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await serviceCatalogService.list(true);
      setItems(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsServicesCopy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm);
  };

  const handleEdit = (item: ServiceOption) => {
    setEditingId(item.id);
    setForm({
      kind: item.parentServiceId ? 'offer' : 'base',
      name: item.name,
      description: item.description || '',
      parentServiceId: item.parentServiceId || '',
      monthlyPrice:
        typeof item.monthlyPrice === 'number'
          ? item.monthlyPrice.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '',
      validFrom: item.validFrom ? item.validFrom.slice(0, 10) : '',
      validUntil: item.validUntil ? item.validUntil.slice(0, 10) : '',
      isActive: item.isActive,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const trimmedDescription = form.description.trim();
      const createPayload = {
        name: form.name,
        description: trimmedDescription || undefined,
        isActive: form.isActive,
      };
      const updatePayload = {
        name: form.name,
        description: trimmedDescription || null,
        isActive: form.isActive,
      };

      if (form.kind === 'offer' && !form.parentServiceId) {
        setError(settingsServicesCopy.parentRequiredError);
        return;
      }

      if (editingId) {
        await serviceCatalogService.update(
          editingId,
          form.kind === 'offer'
            ? {
                ...updatePayload,
                parentServiceId: form.parentServiceId || null,
                monthlyPrice: parseCurrencyInput(form.monthlyPrice) ?? null,
                validFrom: form.validFrom || null,
                validUntil: form.validUntil || null,
              }
            : {
                ...updatePayload,
                parentServiceId: null,
                monthlyPrice: null,
                validFrom: null,
                validUntil: null,
              }
        );
      } else {
        await serviceCatalogService.create(
          form.kind === 'offer'
            ? {
                ...createPayload,
                parentServiceId: form.parentServiceId,
                monthlyPrice: parseCurrencyInput(form.monthlyPrice),
                validFrom: form.validFrom || undefined,
                validUntil: form.validUntil || undefined,
              }
            : createPayload
        );
      }

      await loadItems();
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsServicesCopy.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{settingsServicesCopy.title}</h1>
          <p className="text-sm text-muted-foreground">{settingsServicesCopy.description}</p>
        </div>
        <Button type="button" variant="outline" onClick={loadItems} disabled={loading || saving}>
          {settingsServicesCopy.refresh}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? settingsServicesCopy.editTitle : settingsServicesCopy.createTitle}
            </CardTitle>
            <CardDescription>{settingsServicesCopy.formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {settingsServicesCopy.kindLabel}
                </label>
                <select
                  className="flex h-12 w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]"
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value as 'base' | 'offer',
                      parentServiceId: event.target.value === 'offer' ? current.parentServiceId : '',
                      monthlyPrice: event.target.value === 'offer' ? current.monthlyPrice : '',
                      validFrom: event.target.value === 'offer' ? current.validFrom : '',
                      validUntil: event.target.value === 'offer' ? current.validUntil : '',
                    }))
                  }
                >
                  <option value="base">{settingsServicesCopy.baseType}</option>
                  <option value="offer">{settingsServicesCopy.offerType}</option>
                </select>
              </div>

              <Input
                label={settingsServicesCopy.nameLabel}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={settingsServicesCopy.namePlaceholder}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {settingsServicesCopy.descriptionLabel}
                </label>
                <textarea
                  className={textareaClassName}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder={settingsServicesCopy.descriptionPlaceholder}
                />
              </div>

              {form.kind === 'offer' && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {settingsServicesCopy.parentServiceLabel}
                    </label>
                    <select
                      className="flex h-12 w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]"
                      value={form.parentServiceId}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, parentServiceId: event.target.value }))
                      }
                    >
                      <option value="">{settingsServicesCopy.parentServicePlaceholder}</option>
                      {baseServiceOptions
                        .filter((item) => item.id !== editingId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label={settingsServicesCopy.monthlyPriceLabel}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={form.monthlyPrice}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          monthlyPrice: formatCurrencyInput(event.target.value),
                        }))
                      }
                    />
                    <Input
                      label={settingsServicesCopy.validFromLabel}
                      type="date"
                      value={form.validFrom}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, validFrom: event.target.value }))
                      }
                    />
                  </div>

                  <Input
                    label={settingsServicesCopy.validUntilLabel}
                    type="date"
                    value={form.validUntil}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, validUntil: event.target.value }))
                    }
                  />
                </>
              )}

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isActive: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
                {settingsServicesCopy.activeLabel}
              </label>

              <div className="flex items-center gap-2">
                <Button type="submit" isLoading={saving}>
                  {editingId ? settingsServicesCopy.saveButton : settingsServicesCopy.createButton}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {settingsServicesCopy.cancelButton}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{settingsServicesCopy.listTitle}</CardTitle>
            <CardDescription>{settingsServicesCopy.listDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">{settingsServicesCopy.tableName}</th>
                    <th className="px-3 py-2">{settingsServicesCopy.tableType}</th>
                    <th className="px-3 py-2">{settingsServicesCopy.tableLinkedService}</th>
                    <th className="px-3 py-2">{settingsServicesCopy.tableMonthlyPrice}</th>
                    <th className="px-3 py-2">{settingsServicesCopy.tableValidity}</th>
                    <th className="px-3 py-2 text-center">{settingsServicesCopy.tableStatus}</th>
                    <th className="px-3 py-2 text-center">{settingsServicesCopy.tableOrigin}</th>
                    <th className="px-3 py-2 text-right">{settingsServicesCopy.tableActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsServicesCopy.loading}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsServicesCopy.empty}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="px-3 py-2 text-foreground">
                          <div className="font-medium">{item.name}</div>
                          {item.description && (
                            <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.parentServiceId ? settingsServicesCopy.offerType : settingsServicesCopy.baseType}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.parentService?.name || settingsServicesCopy.notInformed}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatCurrencyValue(item.monthlyPrice)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatValidity(item.validFrom, item.validUntil)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              item.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {item.isActive ? settingsServicesCopy.activeStatus : settingsServicesCopy.inactiveStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">
                          {item.isSystem ? settingsServicesCopy.systemOrigin : settingsServicesCopy.customOrigin}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="outline" onClick={() => handleEdit(item)}>
                            {settingsServicesCopy.editButton}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}