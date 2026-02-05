import { useEffect, useMemo, useState } from 'react';
import {
  assessmentTypeService,
  type AssessmentType,
  type AssessmentScheduleType,
} from '../../services/assessment-type.service';

const defaultForm = {
  name: '',
  code: '',
  description: '',
  scheduleType: 'fixed_interval' as AssessmentScheduleType,
  intervalMonths: 2,
  afterTypeId: '',
  offsetMonths: 0,
  isActive: true,
};

export default function SettingsAssessmentTypes() {
  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });

  const loadTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await assessmentTypeService.list();
      setTypes(data);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar tipos de avaliação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...defaultForm });
  };

  const handleEdit = (item: AssessmentType) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      code: item.code,
      description: item.description || '',
      scheduleType: item.scheduleType,
      intervalMonths: item.intervalMonths ?? 2,
      afterTypeId: item.afterTypeId || '',
      offsetMonths: item.offsetMonths ?? 0,
      isActive: item.isActive,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await assessmentTypeService.update(editingId, {
          name: form.name,
          code: form.code,
          description: form.description,
          scheduleType: form.scheduleType,
          intervalMonths:
            form.scheduleType === 'fixed_interval' ? form.intervalMonths : null,
          afterTypeId:
            form.scheduleType === 'after_type' ? form.afterTypeId || null : null,
          offsetMonths:
            form.scheduleType === 'after_type' ? form.offsetMonths : null,
          isActive: form.isActive,
        });
      } else {
        await assessmentTypeService.create({
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          scheduleType: form.scheduleType,
          intervalMonths:
            form.scheduleType === 'fixed_interval' ? form.intervalMonths : undefined,
          afterTypeId:
            form.scheduleType === 'after_type' ? form.afterTypeId || undefined : undefined,
          offsetMonths:
            form.scheduleType === 'after_type' ? form.offsetMonths : undefined,
          isActive: form.isActive,
        });
      }

      await loadTypes();
      resetForm();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar tipo de avaliação');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await assessmentTypeService.remove(id);
      await loadTypes();
    } catch (err: any) {
      setError(err?.message || 'Erro ao excluir tipo de avaliação');
    } finally {
      setSaving(false);
    }
  };

  const activeTypes = useMemo(
    () => types.filter((item) => item.isActive),
    [types]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tipos de Avaliação</h1>
          <p className="text-sm text-muted-foreground">
            Configure tipos e periodicidades das avaliações físicas.
          </p>
        </div>
        <button
          type="button"
          onClick={loadTypes}
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
            {editingId ? 'Editar Tipo' : 'Cadastrar Tipo'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina o nome, periodicidade e regras de cada avaliação.
          </p>

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: Avaliação Completa"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Código</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: completa"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Descrição</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Detalhes da avaliação"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Periodicidade</label>
              <select
                value={form.scheduleType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scheduleType: e.target.value as AssessmentScheduleType,
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="fixed_interval">Intervalo fixo (em meses)</option>
                <option value="after_type">ApÃ³s outro tipo</option>
              </select>
            </div>

            {form.scheduleType === 'fixed_interval' ? (
              <div>
                <label className="text-sm font-medium text-gray-700">Intervalo (meses)</label>
                <input
                  type="number"
                  min={1}
                  value={form.intervalMonths}
                  onChange={(e) =>
                    setForm({ ...form, intervalMonths: Number(e.target.value) || 1 })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Tipo base</label>
                  <select
                    value={form.afterTypeId}
                    onChange={(e) => setForm({ ...form, afterTypeId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {activeTypes
                      .filter((item) => item.id !== editingId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Intervalo (meses)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.offsetMonths}
                    onChange={(e) =>
                      setForm({ ...form, offsetMonths: Number(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">
                Ativo
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {editingId ? 'Salvar' : 'Cadastrar'}
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
            <h2 className="text-lg font-semibold text-gray-900">Tipos cadastrados</h2>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Periodicidade</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : types.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                      Nenhum tipo cadastrado
                    </td>
                  </tr>
                ) : (
                  types.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-3 py-2 text-gray-700">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.code}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.scheduleType === 'fixed_interval'
                          ? `A cada ${item.intervalMonths || 0} meses`
                          : `ApÃ³s ${types.find((t) => t.id === item.afterTypeId)?.name || 'tipo base'} + ${item.offsetMonths || 0} meses`}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            item.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {item.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
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
