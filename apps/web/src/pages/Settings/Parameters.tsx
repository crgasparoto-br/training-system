import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/Accordion';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { periodizationService, type TrainingParameter } from '../../services/periodization.service';

const DEFAULT_CATEGORIES = [
  'carga_microciclo',
  'objetivo',
  'montagem',
  'metodo',
  'divisao_treino',
  'zona_repeticoes',
  'metodo_ciclico',
  'local',
];

type EditorMode = 'list' | 'create' | 'edit';
type RequiredField = 'category' | 'code' | 'description';
type FieldErrors = Partial<Record<RequiredField, string>>;

const defaultForm = () => ({
  category: '',
  code: '',
  description: '',
  order: 1,
  active: true,
});

const defaultFilters = () => ({
  category: 'all',
  search: '',
  active: 'active',
});

const selectClassName =
  'ts-form-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export default function SettingsParameters() {
  const [parameters, setParameters] = useState<TrainingParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<EditorMode>('list');
  const previousModeRef = useRef<EditorMode>('list');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [categoryEdit, setCategoryEdit] = useState({ from: '', to: '' });
  const [form, setForm] = useState(defaultForm);
  const [filters, setFilters] = useState(defaultFilters);

  const refreshParameters = async () => {
    setLoading(true);
    try {
      const data = await periodizationService.getAllParameters(true);
      const toBoolean = (value: unknown) =>
        value === true || value === 1 || value === 'true' || value === '1';
      setParameters(
        data.map((parameter) => ({
          ...parameter,
          active: toBoolean(parameter.active),
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const loadParameters = async () => {
    setError(null);
    try {
      await refreshParameters();
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar parâmetros.');
    }
  };

  const refreshAfterMutation = async (failureMessage: string) => {
    try {
      await refreshParameters();
      return true;
    } catch {
      setSuccessMessage(null);
      setError(failureMessage);
      return false;
    }
  };

  useEffect(() => {
    void loadParameters();
  }, []);

  useEffect(() => {
    const previousMode = previousModeRef.current;

    if (mode === 'create') {
      document.getElementById('parameter-category')?.focus();
    } else if (mode === 'edit') {
      document.getElementById('parameter-description')?.focus();
    } else if (previousMode !== 'list') {
      document.getElementById('parameters-new-button')?.focus();
    }

    previousModeRef.current = mode;
  }, [mode]);

  const categories = useMemo(() => {
    const fromData = Array.from(new Set(parameters.map((parameter) => parameter.category))).sort();
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...fromData]));
  }, [parameters]);

  const filteredParameters = useMemo(() => {
    const term = filters.search.trim().toLowerCase();

    return parameters
      .filter((parameter) =>
        filters.category === 'all' ? true : parameter.category === filters.category
      )
      .filter((parameter) => {
        if (!term) return true;
        return (
          parameter.code.toLowerCase().includes(term) ||
          parameter.description.toLowerCase().includes(term)
        );
      })
      .filter((parameter) => {
        if (filters.active === 'all') return true;
        return filters.active === 'active' ? parameter.active : !parameter.active;
      })
      .sort(
        (first, second) =>
          first.category.localeCompare(second.category) || first.order - second.order
      );
  }, [parameters, filters]);

  const clearFieldError = (field: RequiredField) => {
    if (!fieldErrors[field]) return;
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const resetEditor = () => {
    setEditingId(null);
    setCategoryMode('select');
    setForm(defaultForm());
    setFieldErrors({});
  };

  const leaveEditor = () => {
    resetEditor();
    setError(null);
    setSuccessMessage(null);
    setMode('list');
  };

  const finishEditor = (message: string) => {
    resetEditor();
    setError(null);
    setSuccessMessage(message);
    setMode('list');
  };

  const handleNew = () => {
    resetEditor();
    setError(null);
    setSuccessMessage(null);
    setMode('create');
  };

  const handleEdit = (parameter: TrainingParameter) => {
    setEditingId(parameter.id);
    setCategoryMode('select');
    setFieldErrors({});
    setError(null);
    setSuccessMessage(null);
    setForm({
      category: parameter.category,
      code: parameter.code,
      description: parameter.description,
      order: parameter.order,
      active: parameter.active,
    });
    setMode('edit');
  };

  const validateForm = () => {
    const nextErrors: FieldErrors = {};
    let firstInvalidId: string | null = null;

    if (!form.category.trim()) {
      nextErrors.category = 'Informe a categoria.';
      firstInvalidId = categoryMode === 'new' ? 'parameter-new-category' : 'parameter-category';
    }
    if (!form.code.trim()) {
      nextErrors.code = 'Informe o código.';
      firstInvalidId ??= 'parameter-code';
    }
    if (!form.description.trim()) {
      nextErrors.description = 'Informe a descrição.';
      firstInvalidId ??= 'parameter-description';
    }

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

    const normalizedCategory = form.category.trim();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (editingId) {
        await periodizationService.updateParameter(editingId, {
          description: form.description,
          order: form.order,
          active: form.active,
        });
        const refreshed = await refreshAfterMutation(
          'Parâmetro atualizado, mas não foi possível atualizar a lista. Use Atualizar para sincronizar os dados.'
        );
        if (!refreshed) {
          resetEditor();
          setMode('list');
          return;
        }
        finishEditor('Parâmetro atualizado com sucesso.');
      } else {
        await periodizationService.createParameter({
          category: normalizedCategory,
          code: form.code,
          description: form.description,
          order: form.order,
        });
        const refreshed = await refreshAfterMutation(
          'Parâmetro criado, mas não foi possível atualizar a lista. Use Atualizar para sincronizar os dados.'
        );
        if (!refreshed) {
          resetEditor();
          setMode('list');
          return;
        }
        finishEditor('Parâmetro criado com sucesso.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar parâmetro.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (parameter: TrainingParameter) => {
    const label = `${parameter.code} — ${parameter.description}`;
    if (!window.confirm(`Excluir “${label}”? Esta ação não pode ser desfeita.`)) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await periodizationService.deleteParameter(parameter.id);
      const refreshed = await refreshAfterMutation(
        `Parâmetro ${parameter.code} foi excluído, mas não foi possível atualizar a lista. Use Atualizar para sincronizar os dados.`
      );
      if (!refreshed) return;
      setSuccessMessage(`Parâmetro ${parameter.code} excluído com sucesso.`);
    } catch (err: any) {
      setError(err?.message || 'Erro ao excluir parâmetro.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenameCategory = async () => {
    const fromCategory = categoryEdit.from.trim();
    const toCategory = categoryEdit.to.trim();

    if (!fromCategory || !toCategory) {
      setError('Informe a categoria atual e a nova categoria.');
      return;
    }
    if (fromCategory === toCategory) {
      setError('A nova categoria deve ser diferente da categoria atual.');
      return;
    }
    if (
      !window.confirm(
        `Renomear “${fromCategory}” para “${toCategory}”? Todos os parâmetros dessa categoria serão atualizados.`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await periodizationService.renameParameterCategory({ fromCategory, toCategory });
      const refreshed = await refreshAfterMutation(
        'Categoria renomeada, mas não foi possível atualizar a lista. Use Atualizar para sincronizar os dados.'
      );
      if (!refreshed) {
        setCategoryEdit({ from: '', to: '' });
        return;
      }
      setFilters((current) => ({
        ...current,
        category: current.category === fromCategory ? toCategory : current.category,
      }));
      setCategoryEdit({ from: '', to: '' });
      setSuccessMessage(`Categoria renomeada de ${fromCategory} para ${toCategory}.`);
    } catch (err: any) {
      setError(err?.message || 'Erro ao renomear categoria.');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setFilters({ category: 'all', search: '', active: 'all' });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-gray-900">Parâmetros de treino</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte e organize os parâmetros usados na montagem e periodização dos treinos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'list' ? (
            <>
              <Button id="parameters-new-button" type="button" onClick={handleNew}>
                Novo parâmetro
              </Button>
              <Button type="button" variant="outline" onClick={loadParameters} disabled={loading || saving}>
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

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {successMessage}
        </div>
      ) : null}

      {mode === 'list' ? (
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardContent className="p-4 sm:p-5">
              <Accordion type="single" collapsible>
                <AccordionItem value="categories" className="border-0">
                  <AccordionTrigger className="py-1 text-base font-semibold text-foreground hover:no-underline">
                    Gerenciar categorias
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
                      Use esta opção quando precisar corrigir o nome de uma categoria. A alteração é aplicada a todos os parâmetros que pertencem à categoria selecionada.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
                      <div>
                        <label htmlFor="category-current" className="mb-2 block text-sm font-medium text-foreground">
                          Categoria atual
                        </label>
                        <select
                          id="category-current"
                          value={categoryEdit.from}
                          onChange={(event) =>
                            setCategoryEdit((current) => ({ ...current, from: event.target.value }))
                          }
                          disabled={saving}
                          className={selectClassName}
                        >
                          <option value="">Selecione...</option>
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        id="category-new-name"
                        label="Nova categoria"
                        value={categoryEdit.to}
                        onChange={(event) =>
                          setCategoryEdit((current) => ({ ...current, to: event.target.value }))
                        }
                        disabled={saving}
                        placeholder="Ex.: zona_repeticoes"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRenameCategory}
                        disabled={saving}
                        isLoading={saving}
                        loadingText="Renomeando..."
                      >
                        Renomear categoria
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Quando a categoria precisar seguir o padrão técnico do sistema, use nomes em snake_case, como zona_repeticoes.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle className="text-xl">Parâmetros cadastrados</CardTitle>
              <p className="text-sm text-muted-foreground">
                Filtre por categoria e status ou busque por código e descrição.
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,1.5fr)]">
                <div>
                  <label htmlFor="parameter-filter-category" className="mb-2 block text-sm font-medium text-foreground">
                    Categoria
                  </label>
                  <select
                    id="parameter-filter-category"
                    value={filters.category}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, category: event.target.value }))
                    }
                    className={selectClassName}
                  >
                    <option value="all">Todas as categorias</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="parameter-filter-status" className="mb-2 block text-sm font-medium text-foreground">
                    Status
                  </label>
                  <select
                    id="parameter-filter-status"
                    value={filters.active}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, active: event.target.value }))
                    }
                    className={selectClassName}
                  >
                    <option value="active">Ativos</option>
                    <option value="inactive">Inativos</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
                <Input
                  id="parameter-filter-search"
                  label="Buscar"
                  value={filters.search}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, search: event.target.value }))
                  }
                  placeholder="Código ou descrição"
                />
              </div>

              <div className="mt-6">
                {loading ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                    Carregando parâmetros...
                  </div>
                ) : parameters.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                    <h2 className="text-base font-semibold text-foreground">Nenhum parâmetro cadastrado</h2>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                      Cadastre o primeiro parâmetro para disponibilizá-lo nas rotinas de treino.
                    </p>
                    <Button type="button" className="mt-4" onClick={handleNew}>
                      Novo parâmetro
                    </Button>
                  </div>
                ) : filteredParameters.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                    <h2 className="text-base font-semibold text-foreground">Nenhum resultado com estes filtros</h2>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                      Revise os filtros ou limpe a busca para voltar a visualizar os parâmetros cadastrados.
                    </p>
                    <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-[760px] w-full text-sm">
                      <caption className="sr-only">Lista de parâmetros de treino</caption>
                      <thead className="bg-muted/40">
                        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                          <th scope="col" className="px-4 py-3">Categoria</th>
                          <th scope="col" className="px-4 py-3">Código</th>
                          <th scope="col" className="px-4 py-3">Descrição</th>
                          <th scope="col" className="px-4 py-3 text-center">Ordem</th>
                          <th scope="col" className="px-4 py-3 text-center">Status</th>
                          <th scope="col" className="px-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParameters.map((parameter) => (
                          <tr key={parameter.id} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 align-top text-foreground">{parameter.category}</td>
                            <td className="px-4 py-3 align-top font-medium text-foreground">{parameter.code}</td>
                            <td className="max-w-xl break-words px-4 py-3 align-top text-foreground">
                              {parameter.description}
                            </td>
                            <td className="px-4 py-3 text-center align-top text-foreground">{parameter.order}</td>
                            <td className="px-4 py-3 text-center align-top">
                              <span
                                className={
                                  parameter.active
                                    ? 'inline-flex rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success'
                                    : 'inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
                                }
                              >
                                {parameter.active ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(parameter)}
                                  disabled={saving}
                                >
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(parameter)}
                                  disabled={saving}
                                >
                                  Excluir
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-xl">
              {mode === 'edit' ? 'Editar parâmetro' : 'Novo parâmetro'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {mode === 'edit'
                ? 'Atualize a descrição, a ordem e o status. Categoria e código permanecem fixos.'
                : 'Defina a categoria, o código e a descrição usados nas rotinas de treino.'}
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <form className="mx-auto max-w-3xl space-y-6" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="parameter-category" className="mb-2 block text-sm font-medium text-foreground">
                  Categoria <span className="text-destructive">*</span>
                </label>
                <select
                  id="parameter-category"
                  value={categoryMode === 'new' ? '__new__' : form.category}
                  onChange={(event) => {
                    clearFieldError('category');
                    if (event.target.value === '__new__') {
                      setCategoryMode('new');
                      setForm((current) => ({ ...current, category: '' }));
                      return;
                    }
                    setCategoryMode('select');
                    setForm((current) => ({ ...current, category: event.target.value }));
                  }}
                  disabled={mode === 'edit' || saving}
                  aria-invalid={categoryMode === 'select' && fieldErrors.category ? true : undefined}
                  aria-describedby={
                    categoryMode === 'select' && fieldErrors.category ? 'parameter-category-error' : undefined
                  }
                  className={selectClassName}
                >
                  <option value="">Selecione...</option>
                  <option value="__new__">Nova categoria...</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {categoryMode === 'new' && mode === 'create' ? (
                  <div className="mt-3">
                    <Input
                      id="parameter-new-category"
                      label="Nome da nova categoria"
                      required
                      value={form.category}
                      error={fieldErrors.category}
                      onChange={(event) => {
                        clearFieldError('category');
                        setForm((current) => ({ ...current, category: event.target.value }));
                      }}
                      disabled={saving}
                      placeholder="Ex.: zona_repeticoes"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Use snake_case quando a categoria precisar seguir o padrão técnico do sistema.
                    </p>
                  </div>
                ) : fieldErrors.category ? (
                  <p id="parameter-category-error" className="mt-1 text-sm text-destructive">
                    {fieldErrors.category}
                  </p>
                ) : null}
              </div>

              <Input
                id="parameter-code"
                label="Código"
                required
                value={form.code}
                error={fieldErrors.code}
                onChange={(event) => {
                  clearFieldError('code');
                  setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }));
                }}
                disabled={mode === 'edit' || saving}
                placeholder="Ex.: ADP"
              />

              <Input
                id="parameter-description"
                label="Descrição"
                required
                value={form.description}
                error={fieldErrors.description}
                onChange={(event) => {
                  clearFieldError('description');
                  setForm((current) => ({ ...current, description: event.target.value }));
                }}
                disabled={saving}
                placeholder="Ex.: Adaptação"
              />

              <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
                <Input
                  id="parameter-order"
                  type="number"
                  min={1}
                  label="Ordem"
                  value={form.order}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, order: Number(event.target.value) || 1 }))
                  }
                  disabled={saving}
                />
                {mode === 'edit' ? (
                  <label
                    htmlFor="parameter-active"
                    className="flex h-11 items-center gap-3 rounded-lg border border-input bg-card px-4 text-sm text-foreground"
                  >
                    <input
                      id="parameter-active"
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, active: event.target.checked }))
                      }
                      disabled={saving}
                      className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    Parâmetro ativo
                  </label>
                ) : (
                  <div className="flex min-h-11 items-center rounded-lg border border-border bg-muted/30 px-4 text-sm text-muted-foreground">
                    Novos parâmetros são criados como ativos.
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={leaveEditor} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  isLoading={saving}
                  loadingText="Salvando..."
                >
                  {mode === 'edit' ? 'Salvar alterações' : 'Salvar parâmetro'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
