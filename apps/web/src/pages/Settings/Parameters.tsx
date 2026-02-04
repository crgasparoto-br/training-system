import { useEffect, useMemo, useState } from 'react';
import { periodizationService, TrainingParameter } from '../../services/periodization.service';

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

export default function SettingsParameters() {
  const [parameters, setParameters] = useState<TrainingParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [categoryEdit, setCategoryEdit] = useState({ from: '', to: '' });

  const [form, setForm] = useState({
    category: '',
    code: '',
    description: '',
    order: 1,
    active: true,
  });

  const [filters, setFilters] = useState({
    category: 'all',
    search: '',
    active: 'active',
  });

  const loadParameters = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await periodizationService.getAllParameters(true);
      const toBoolean = (value: any) =>
        value === true || value === 1 || value === 'true' || value === '1';
      setParameters(
        data.map((param) => ({
          ...param,
          active: toBoolean(param.active),
        }))
      );
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar parâmetros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParameters();
  }, []);

  const categories = useMemo(() => {
    const fromData = Array.from(new Set(parameters.map((p) => p.category))).sort();
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...fromData]));
    return merged;
  }, [parameters]);

  const filteredParameters = useMemo(() => {
    return parameters
      .filter((param) => (filters.category === 'all' ? true : param.category === filters.category))
      .filter((param) => {
        if (!filters.search.trim()) return true;
        const term = filters.search.toLowerCase();
        return (
          param.code.toLowerCase().includes(term) ||
          param.description.toLowerCase().includes(term)
        );
      })
      .filter((param) => {
        if (filters.active === 'all') return true;
        return filters.active === 'active' ? param.active : !param.active;
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  }, [parameters, filters]);

  const resetForm = (keepCategory?: string) => {
    setEditingId(null);
    setCategoryMode('select');
    setForm({
      category: keepCategory ?? '',
      code: '',
      description: '',
      order: 1,
      active: true,
    });
  };

  const handleEdit = (param: TrainingParameter) => {
    setEditingId(param.id);
    setCategoryMode('select');
    setForm({
      category: param.category,
      code: param.code,
      description: param.description,
      order: param.order,
      active: param.active,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCategory = form.category.trim();
    if (!normalizedCategory || !form.code || !form.description) {
      setError('Preencha categoria, código e descrição.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await periodizationService.updateParameter(editingId, {
          description: form.description,
          order: form.order,
          active: form.active,
        });
        await loadParameters();
        resetForm();
        return;
      } else {
        await periodizationService.createParameter({
          category: normalizedCategory,
          code: form.code,
          description: form.description,
          order: form.order,
        });
      }

      await loadParameters();
      resetForm(normalizedCategory);
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar parâmetro');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await periodizationService.deleteParameter(id);
      await loadParameters();
    } catch (err: any) {
      setError(err?.message || 'Erro ao excluir parâmetro');
    } finally {
      setSaving(false);
    }
  };

  const handleRenameCategory = async () => {
    const fromCategory = categoryEdit.from.trim();
    const toCategory = categoryEdit.to.trim();

    if (!fromCategory || !toCategory) {
      setError('Informe categoria atual e nova.');
      return;
    }

    if (fromCategory === toCategory) {
      setError('A nova categoria deve ser diferente.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await periodizationService.renameParameterCategory({
        fromCategory,
        toCategory,
      });
      await loadParameters();
      setCategoryEdit({ from: '', to: '' });
    } catch (err: any) {
      setError(err?.message || 'Erro ao renomear categoria');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parâmetros</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro, consulta e alteração dos parâmetros da periodização.
          </p>
        </div>
        <button
          type="button"
          onClick={loadParameters}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Atualizar lista
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Gerenciar categorias</h3>
            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <select
                value={categoryEdit.from}
                onChange={(e) => setCategoryEdit({ ...categoryEdit, from: e.target.value })}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Categoria atual</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={categoryEdit.to}
                onChange={(e) => setCategoryEdit({ ...categoryEdit, to: e.target.value })}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Nova categoria"
              />
              <button
                type="button"
                onClick={handleRenameCategory}
                disabled={saving}
                className="h-10 whitespace-nowrap rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                Renomear
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Renomeia a categoria de todos os parâmetros existentes.
            </p>
          </div>

          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? 'Alterar Parâmetro' : 'Cadastrar Parâmetro'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingId
              ? 'Edite a descrição, ordem e status do parâmetro.'
              : 'Crie um novo parâmetro para uso nas rotinas de treino.'}
          </p>

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-gray-700">Categoria</label>
              <div className="mt-1 flex flex-col gap-2">
                <select
                  value={categoryMode === 'new' ? '__new__' : form.category}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setCategoryMode('new');
                      setForm({ ...form, category: '' });
                      return;
                    }

                    setCategoryMode('select');
                    setForm({ ...form, category: e.target.value });
                  }}
                  disabled={!!editingId}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  <option value="__new__">Nova categoria...</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                {categoryMode === 'new' && (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      disabled={!!editingId}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Ex: zona_repeticoes"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use nomes em snake_case para manter o padrão das categorias.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Código</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                disabled={!!editingId}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: ADP"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Descrição</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: Adaptação"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Ordem</label>
                <input
                  type="number"
                  min={1}
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 1 })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <input
                  id="active"
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="active" className="text-sm text-gray-700">
                  Ativo
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {editingId ? 'Salvar alterações' : 'Cadastrar'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Consulta e alteração</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">Todas as categorias</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={filters.active}
                onChange={(e) => setFilters({ ...filters, active: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="all">Todos</option>
              </select>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Buscar por código ou descrição"
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 text-center">Ordem</th>
                  <th className="px-3 py-2 text-center">Ativo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredParameters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
Nenhum parâmetro encontrado
                    </td>
                  </tr>
                ) : (
                  filteredParameters.map((param) => (
                    <tr key={param.id} className="border-b">
                      <td className="px-3 py-2 text-gray-700">{param.category}</td>
                      <td className="px-3 py-2 text-gray-700">{param.code}</td>
                      <td className="px-3 py-2 text-gray-700">{param.description}</td>
                      <td className="px-3 py-2 text-center text-gray-700">{param.order}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            param.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {param.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(param)}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(param.id)}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
