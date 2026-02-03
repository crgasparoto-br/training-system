import { useEffect, useMemo, useState } from 'react';
import { periodizationService, TrainingParameter } from '../../services/periodization.service';

const DEFAULT_CATEGORIES = [
  'carga_microciclo',
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

  const resetForm = () => {
    setEditingId(null);
    setForm({
      category: '',
      code: '',
      description: '',
      order: 1,
      active: true,
    });
  };

  const handleEdit = (param: TrainingParameter) => {
    setEditingId(param.id);
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
    if (!form.category || !form.code || !form.description) {
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
      } else {
        await periodizationService.createParameter({
          category: form.category,
          code: form.code,
          description: form.description,
          order: form.order,
        });
      }

      await loadParameters();
      resetForm();
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
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                disabled={!!editingId}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
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
