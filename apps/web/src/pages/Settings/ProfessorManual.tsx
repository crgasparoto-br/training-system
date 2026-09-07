import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/Accordion';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import {
  PROFESSOR_MANUAL_LOCALE,
  professorManualContextLabels,
  professorManualFormatLabels,
} from '../../constants/professorManual';
import {
  professorManualService,
  type ProfessorManualContext,
  type ProfessorManualFormat,
  type ProfessorManualItem,
  type ProfessorManualPayload,
} from '../../services/professor-manual.service';
import { useAuthStore } from '../../stores/useAuthStore';

const contextOptions: Array<{ value: ProfessorManualContext; label: string }> = [
  { value: 'avaliacao_fisica', label: professorManualContextLabels.avaliacao_fisica },
  { value: 'montagem_treino', label: professorManualContextLabels.montagem_treino },
  { value: 'uso_sistema', label: professorManualContextLabels.uso_sistema },
];

const formatOptions: Array<{ value: ProfessorManualFormat; label: string }> = [
  { value: 'dica_rapida', label: professorManualFormatLabels.dica_rapida },
  { value: 'alerta', label: professorManualFormatLabels.alerta },
  { value: 'exemplo', label: professorManualFormatLabels.exemplo },
  { value: 'lembrete_metodo', label: professorManualFormatLabels.lembrete_metodo },
  { value: 'saiba_mais', label: professorManualFormatLabels.saiba_mais },
];

type EditorMode = 'list' | 'create' | 'edit';
type RequiredField = 'setor' | 'item' | 'frase' | 'title' | 'content' | 'code' | 'productArea';
type FieldErrors = Partial<Record<RequiredField, string>>;

const requiredFields: Array<{ key: RequiredField; id: string; message: string }> = [
  { key: 'setor', id: 'professor-manual-setor', message: 'Informe o setor.' },
  { key: 'item', id: 'professor-manual-item', message: 'Informe o item.' },
  { key: 'frase', id: 'professor-manual-frase', message: 'Informe a frase de orientação.' },
  { key: 'title', id: 'professor-manual-title', message: 'Informe o título no sistema.' },
  { key: 'content', id: 'professor-manual-content', message: 'Informe o texto de apoio.' },
  { key: 'code', id: 'professor-manual-code', message: 'Informe o código.' },
  { key: 'productArea', id: 'professor-manual-product-area', message: 'Informe o ponto do produto.' },
];

const defaultForm = (): ProfessorManualPayload => ({
  code: '',
  title: '',
  content: '',
  format: 'dica_rapida',
  context: 'avaliacao_fisica',
  servicoContratado: 'Todos',
  setor: 'Todos',
  item: '',
  frase: '',
  productArea: '',
  productMoment: '',
  linkLabel: 'Abrir cadastro do manual',
  linkHref: '',
  order: 0,
  isActive: true,
});

const selectClassName =
  'h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const textareaClassName =
  'min-h-[116px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function fieldValue(form: ProfessorManualPayload, key: RequiredField) {
  const value = form[key];
  return typeof value === 'string' ? value.trim() : '';
}

export default function SettingsProfessorManual() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<ProfessorManualItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<EditorMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfessorManualPayload>(defaultForm);
  const [filters, setFilters] = useState({
    context: 'all',
    format: 'all',
    status: 'active',
    search: '',
  });

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await professorManualService.list({ includeInactive: true });
      setItems(data);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar o Manual do Professor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const contractTypeLabel = useMemo(() => {
    const contractType = user?.professor?.contract?.type;
    if (contractType === 'academy') return 'Academia';
    if (contractType === 'personal') return 'Personal';
    return 'Não identificado';
  }, [user?.professor?.contract?.type]);

  const filteredItems = useMemo(() => {
    const term = filters.search.trim().toLowerCase();

    return items
      .filter((item) => (filters.context === 'all' ? true : item.context === filters.context))
      .filter((item) => (filters.format === 'all' ? true : item.format === filters.format))
      .filter((item) => {
        if (filters.status === 'all') return true;
        return filters.status === 'active' ? item.isActive : !item.isActive;
      })
      .filter((item) => {
        if (!term) return true;
        const haystack = [
          item.code,
          item.title,
          item.content,
          item.servicoContratado,
          item.productArea,
          item.productMoment,
          item.setor,
          item.item,
          item.frase,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => {
        if (a.context !== b.context) {
          return professorManualContextLabels[a.context].localeCompare(
            professorManualContextLabels[b.context],
            PROFESSOR_MANUAL_LOCALE
          );
        }
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title, PROFESSOR_MANUAL_LOCALE);
      });
  }, [filters, items]);

  const totalsByContext = useMemo(() => {
    return contextOptions.map((option) => ({
      ...option,
      total: items.filter((item) => item.context === option.value && item.isActive).length,
    }));
  }, [items]);

  const clearFieldError = (key: RequiredField) => {
    if (!fieldErrors[key]) return;
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const leaveEditor = () => {
    setMode('list');
    setEditingId(null);
    setForm(defaultForm());
    setFieldErrors({});
    setError(null);
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(defaultForm());
    setFieldErrors({});
    setError(null);
    setMode('create');
  };

  const handleEdit = (item: ProfessorManualItem) => {
    setEditingId(item.id);
    setFieldErrors({});
    setError(null);
    setForm({
      code: item.code,
      title: item.title,
      content: item.content,
      format: item.format,
      context: item.context,
      servicoContratado: item.servicoContratado || '',
      setor: item.setor || '',
      item: item.item || '',
      frase: item.frase || '',
      productArea: item.productArea,
      productMoment: item.productMoment || '',
      linkLabel: item.linkLabel || '',
      linkHref: item.linkHref || '',
      order: item.order,
      isActive: item.isActive,
    });
    setMode('edit');
  };

  const validateForm = () => {
    const nextErrors: FieldErrors = {};
    let firstInvalidId: string | null = null;

    requiredFields.forEach((field) => {
      if (!fieldValue(form, field.key)) {
        nextErrors[field.key] = field.message;
        firstInvalidId ??= field.id;
      }
    });

    setFieldErrors(nextErrors);
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus();
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await professorManualService.update(editingId, form);
      } else {
        await professorManualService.create(form);
      }
      await loadItems();
      leaveEditor();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao salvar item do manual.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ProfessorManualItem) => {
    const itemLabel = item.item || item.title || item.code;
    if (!window.confirm(`Excluir “${itemLabel}”? Esta ação não pode ser desfeita.`)) return;

    setSaving(true);
    setError(null);
    try {
      await professorManualService.remove(item.id);
      await loadItems();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao excluir item do manual.');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setFilters({ context: 'all', format: 'all', status: 'all', search: '' });
  };

  const renderStatus = (item: ProfessorManualItem) => (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {item.isActive ? 'Ativo' : 'Inativo'}
    </span>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-gray-900">Manual do Professor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre e organize as orientações que apoiam o professor durante avaliações, montagem de treinos e uso do sistema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'list' ? (
            <>
              <Button type="button" onClick={handleNew}>
                Novo item
              </Button>
              <Button type="button" variant="outline" onClick={loadItems} disabled={loading}>
                Atualizar
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={leaveEditor} disabled={saving}>
              Voltar para lista
            </Button>
          )}
        </div>
      </header>

      {mode === 'list' ? (
        <div className="grid gap-3 md:grid-cols-3" aria-label="Resumo por contexto">
          {totalsByContext.map((item) => (
            <Card key={item.value} className="shadow-none">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{item.total}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFilters((current) => ({ ...current, context: item.value }))}
                  aria-label={`Filtrar por ${item.label}`}
                >
                  Filtrar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {mode !== 'list' ? (
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-xl">{mode === 'edit' ? 'Editar item do manual' : 'Novo item do manual'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Organize a orientação primeiro e deixe os ajustes técnicos opcionais para o final.
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <form className="mx-auto max-w-5xl space-y-8" onSubmit={handleSubmit} noValidate>
              <section aria-labelledby="orientacao-heading" className="space-y-4">
                <div>
                  <h2 id="orientacao-heading" className="text-base font-semibold text-gray-900">Orientação</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Defina o assunto e a frase que o professor deve consultar.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    id="professor-manual-setor"
                    label="Setor"
                    required
                    value={form.setor || ''}
                    error={fieldErrors.setor}
                    onChange={(event) => {
                      clearFieldError('setor');
                      setForm({ ...form, setor: event.target.value });
                    }}
                    placeholder="Ex: Todos"
                  />
                  <Input
                    id="professor-manual-item"
                    label="Item"
                    required
                    value={form.item || ''}
                    error={fieldErrors.item}
                    onChange={(event) => {
                      clearFieldError('item');
                      setForm({ ...form, item: event.target.value });
                    }}
                    placeholder="Ex: Vestimenta"
                  />
                </div>
                <div>
                  <label htmlFor="professor-manual-frase" className="mb-2 block text-sm font-medium text-foreground">
                    Frase <span className="ml-1 text-destructive">*</span>
                  </label>
                  <textarea
                    id="professor-manual-frase"
                    value={form.frase || ''}
                    aria-invalid={fieldErrors.frase ? true : undefined}
                    aria-describedby={fieldErrors.frase ? 'professor-manual-frase-error' : undefined}
                    onChange={(event) => {
                      clearFieldError('frase');
                      setForm({ ...form, frase: event.target.value });
                    }}
                    className={`${textareaClassName} ${fieldErrors.frase ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    placeholder="Escreva a orientação de forma direta para o professor."
                  />
                  {fieldErrors.frase ? <p id="professor-manual-frase-error" className="mt-1 text-sm text-destructive">{fieldErrors.frase}</p> : null}
                </div>
              </section>

              <section aria-labelledby="aplicacao-heading" className="space-y-4 border-t border-border pt-6">
                <div>
                  <h2 id="aplicacao-heading" className="text-base font-semibold text-gray-900">Onde se aplica</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Defina em quais situações esta orientação deve estar disponível.</p>
                </div>
                <Input
                  label="Serviço contratado"
                  value={form.servicoContratado || ''}
                  onChange={(event) => setForm({ ...form, servicoContratado: event.target.value })}
                  placeholder="Ex: Todos ou Personal|Consultoria"
                />
                <p className="-mt-2 text-xs text-muted-foreground">Contrato atual: {contractTypeLabel}.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="professor-manual-context" className="mb-2 block text-sm font-medium text-foreground">Contexto</label>
                    <select
                      id="professor-manual-context"
                      value={form.context}
                      onChange={(event) => setForm({ ...form, context: event.target.value as ProfessorManualContext })}
                      className={selectClassName}
                    >
                      {contextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="professor-manual-format" className="mb-2 block text-sm font-medium text-foreground">Formato</label>
                    <select
                      id="professor-manual-format"
                      value={form.format}
                      onChange={(event) => setForm({ ...form, format: event.target.value as ProfessorManualFormat })}
                      className={selectClassName}
                    >
                      {formatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              <section aria-labelledby="appearance-heading" className="space-y-4 border-t border-border pt-6">
                <div>
                  <h2 id="appearance-heading" className="text-base font-semibold text-gray-900">Como aparece no sistema</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Defina o título e o texto de apoio exibidos durante o uso do sistema.</p>
                </div>
                <Input
                  id="professor-manual-title"
                  label="Título no sistema"
                  required
                  value={form.title}
                  error={fieldErrors.title}
                  onChange={(event) => {
                    clearFieldError('title');
                    setForm({ ...form, title: event.target.value });
                  }}
                  placeholder="Ex: Objetivo do período primeiro"
                />
                <div>
                  <label htmlFor="professor-manual-content" className="mb-2 block text-sm font-medium text-foreground">
                    Texto de apoio <span className="ml-1 text-destructive">*</span>
                  </label>
                  <textarea
                    id="professor-manual-content"
                    value={form.content}
                    aria-invalid={fieldErrors.content ? true : undefined}
                    aria-describedby={fieldErrors.content ? 'professor-manual-content-error' : undefined}
                    onChange={(event) => {
                      clearFieldError('content');
                      setForm({ ...form, content: event.target.value });
                    }}
                    className={`${textareaClassName} ${fieldErrors.content ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    placeholder="Frase curta e orientativa para o momento da ação."
                  />
                  {fieldErrors.content ? <p id="professor-manual-content-error" className="mt-1 text-sm text-destructive">{fieldErrors.content}</p> : null}
                </div>
              </section>

              <section aria-labelledby="identification-heading" className="space-y-4 border-t border-border pt-6">
                <div>
                  <h2 id="identification-heading" className="text-base font-semibold text-gray-900">Identificação no sistema</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Estes identificadores são obrigatórios para manter o vínculo atual com o produto.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    id="professor-manual-code"
                    label="Código"
                    required
                    value={form.code}
                    error={fieldErrors.code}
                    onChange={(event) => {
                      clearFieldError('code');
                      setForm({ ...form, code: event.target.value.toUpperCase() });
                    }}
                    placeholder="Ex: VESTIMENTA_PADRAO"
                  />
                  <Input
                    id="professor-manual-product-area"
                    label="Ponto do produto"
                    required
                    value={form.productArea}
                    error={fieldErrors.productArea}
                    onChange={(event) => {
                      clearFieldError('productArea');
                      setForm({ ...form, productArea: event.target.value });
                    }}
                    placeholder="Ex: workout_builder_liberacao"
                  />
                </div>
              </section>

              <section aria-labelledby="advanced-heading" className="border-t border-border pt-6">
                <h2 id="advanced-heading" className="sr-only">Configurações avançadas</h2>
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="rounded-xl border border-border px-4">
                    <AccordionTrigger className="py-4 text-base font-semibold no-underline hover:no-underline">
                      Configurações avançadas
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          type="number"
                          min={0}
                          label="Ordem"
                          value={form.order ?? 0}
                          onChange={(event) => setForm({ ...form, order: Number(event.target.value) || 0 })}
                        />
                        <Input
                          label="Momento da orientação"
                          value={form.productMoment || ''}
                          onChange={(event) => setForm({ ...form, productMoment: event.target.value })}
                          placeholder="Ex: antes de liberar a semana"
                        />
                        <Input
                          label="Label do link"
                          value={form.linkLabel || ''}
                          onChange={(event) => setForm({ ...form, linkLabel: event.target.value })}
                          placeholder="Ex: Abrir cadastro do manual"
                        />
                        <Input
                          label="Link"
                          value={form.linkHref || ''}
                          onChange={(event) => setForm({ ...form, linkHref: event.target.value })}
                          placeholder="/settings/professor-manual?context=avaliacao_fisica"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>

              <section aria-labelledby="status-heading" className="space-y-4 border-t border-border pt-6">
                <h2 id="status-heading" className="text-base font-semibold text-gray-900">Status e ações</h2>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isActive ?? true}
                    onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                    className="h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  Item ativo
                </label>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={leaveEditor} disabled={saving}>
                    {mode === 'edit' ? 'Cancelar edição' : 'Cancelar'}
                  </Button>
                  <Button type="submit" isLoading={saving}>
                    {mode === 'edit' ? 'Salvar alterações' : 'Salvar item'}
                  </Button>
                </div>
              </section>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_2fr]">
              <div>
                <label htmlFor="professor-manual-filter-context" className="mb-1 block text-xs font-medium text-muted-foreground">Contexto</label>
                <select
                  id="professor-manual-filter-context"
                  value={filters.context}
                  onChange={(event) => setFilters({ ...filters, context: event.target.value })}
                  className={selectClassName}
                >
                  <option value="all">Todos os contextos</option>
                  {contextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="professor-manual-filter-format" className="mb-1 block text-xs font-medium text-muted-foreground">Formato</label>
                <select
                  id="professor-manual-filter-format"
                  value={filters.format}
                  onChange={(event) => setFilters({ ...filters, format: event.target.value })}
                  className={selectClassName}
                >
                  <option value="all">Todos os formatos</option>
                  {formatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="professor-manual-filter-status" className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select
                  id="professor-manual-filter-status"
                  value={filters.status}
                  onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                  className={selectClassName}
                >
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                  <option value="all">Todos</option>
                </select>
              </div>
              <Input
                label="Buscar"
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="Buscar por setor, item, frase, título, serviço ou ponto do produto"
              />
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Carregando itens...</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <h2 className="text-lg font-semibold text-gray-900">Nenhum item cadastrado</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Crie a primeira orientação para começar a organizar o Manual do Professor.</p>
                <Button type="button" className="mt-4" onClick={handleNew}>Novo item</Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 text-center">
                <h2 className="text-lg font-semibold text-gray-900">Nenhum resultado com estes filtros</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Revise a busca ou limpe os filtros para voltar a ver os itens cadastrados.</p>
                <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>Limpar filtros</Button>
              </div>
            ) : (
              <>
                <div className="mt-6 hidden overflow-hidden rounded-xl border border-border md:block">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/40">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-[18%] px-4 py-3">Setor</th>
                        <th className="w-[24%] px-4 py-3">Item</th>
                        <th className="w-[28%] px-4 py-3">Contexto / formato</th>
                        <th className="w-[8%] px-4 py-3 text-center">Ordem</th>
                        <th className="w-[10%] px-4 py-3 text-center">Status</th>
                        <th className="w-[12%] px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-b-0 align-top">
                          <td className="px-4 py-4 text-gray-700">
                            <p className="break-words font-medium text-gray-900">{item.setor || '-'}</p>
                            {item.servicoContratado ? <p className="mt-1 truncate text-xs text-muted-foreground" title={item.servicoContratado}>{item.servicoContratado}</p> : null}
                          </td>
                          <td className="px-4 py-4 text-gray-700">
                            <p className="line-clamp-2 break-words" title={item.item || undefined}>{item.item || '-'}</p>
                          </td>
                          <td className="px-4 py-4 text-gray-700">
                            <p className="font-medium text-gray-900">{professorManualContextLabels[item.context]}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{professorManualFormatLabels[item.format]}</p>
                          </td>
                          <td className="px-4 py-4 text-center text-gray-700">{item.order}</td>
                          <td className="px-4 py-4 text-center">{renderStatus(item)}</td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex flex-col items-end gap-2 lg:flex-row lg:justify-end">
                              <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(item)}>Editar</Button>
                              <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete(item)} disabled={saving}>Excluir</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-3 md:hidden">
                  {filteredItems.map((item) => (
                    <article key={item.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.setor || '-'}</p>
                          <h2 className="mt-1 break-words text-base font-semibold text-gray-900">{item.item || item.title}</h2>
                        </div>
                        {renderStatus(item)}
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm">
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">Contexto</dt>
                          <dd className="mt-1 text-gray-800">{professorManualContextLabels[item.context]}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">Formato</dt>
                          <dd className="mt-1 text-gray-800">{professorManualFormatLabels[item.format]}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(item)}>Editar</Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete(item)} disabled={saving}>Excluir</Button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
