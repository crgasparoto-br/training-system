import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
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

export default function SettingsProfessorManual() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<ProfessorManualItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm());
  };

  const handleEdit = (item: ProfessorManualItem) => {
    setEditingId(item.id);
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
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (
      !form.code.trim() ||
      !form.title.trim() ||
      !form.content.trim() ||
      !form.productArea.trim() ||
      !form.setor?.trim() ||
      !form.item?.trim() ||
      !form.frase?.trim()
    ) {
      setError(
        'Preencha código, setor, item, frase, título no sistema, texto de apoio e ponto do produto.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await professorManualService.update(editingId, form);
      } else {
        await professorManualService.create(form);
      }
      await loadItems();
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao salvar item do manual.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await professorManualService.remove(id);
      await loadItems();
      if (editingId === id) resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao excluir item do manual.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manual do Professor</h1>
          <p className="text-sm text-muted-foreground">
            Estruture o cadastro com base na planilha original: Setor, Item e Frase.
          </p>
        </div>
        <Button variant="outline" onClick={loadItems}>
          Atualizar lista
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {totalsByContext.map((item) => (
          <div key={item.value} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{item.total}</p>
            <p className="text-sm text-muted-foreground">itens ativos conectados ao fluxo</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Editar item do manual' : 'Cadastrar item do manual'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre primeiro a base do manual e depois ajuste como ela será exibida no sistema.
            </p>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <p className="font-semibold">Referência da planilha</p>
              <p className="mt-1">
                Use os cabeçalhos da planilha como base: <strong>Setor</strong>, <strong>Item</strong> e <strong>Frase</strong>.
              </p>
              <p className="mt-1">
                Observação: configure o campo de serviço conforme o serviço contratado. Contrato atual:{' '}
                <strong>{contractTypeLabel}</strong>.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Código</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  placeholder="EX: VESTIMENTA_PADRAO"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Ordem</span>
                <input
                  type="number"
                  min={0}
                  value={form.order ?? 0}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                />
              </label>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Base do manual</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Campos equivalentes aos cabeçalhos e textos da planilha.
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Setor</span>
                  <input
                    value={form.setor || ''}
                    onChange={(e) => setForm({ ...form, setor: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                    placeholder="Ex: Todos"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Item</span>
                  <input
                    value={form.item || ''}
                    onChange={(e) => setForm({ ...form, item: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                    placeholder="Ex: Vestimenta"
                  />
                </label>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-sm font-medium text-gray-700">Frase</span>
                <textarea
                  value={form.frase || ''}
                  onChange={(e) => setForm({ ...form, frase: e.target.value })}
                  className="min-h-[110px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ex: Vestimenta: Estar sempre uniformizado durante atendimento..."
                />
              </label>

              <label className="mt-4 block space-y-1">
                <span className="text-sm font-medium text-gray-700">Serviço contratado</span>
                <input
                  value={form.servicoContratado || ''}
                  onChange={(e) => setForm({ ...form, servicoContratado: e.target.value })}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  placeholder="Ex: Todos ou Personal|Consultoria"
                />
                <span className="block text-xs text-muted-foreground">
                  Use este campo quando a aplicação do item depender do serviço contratado.
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Aplicação no sistema</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure como a frase do manual será transformada em apoio contextual dentro do app.
                </p>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-sm font-medium text-gray-700">Título no sistema</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  placeholder="Ex: Objetivo do período primeiro"
                />
              </label>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Contexto</span>
                  <select
                    value={form.context}
                    onChange={(e) => setForm({ ...form, context: e.target.value as ProfessorManualContext })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  >
                    {contextOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Formato</span>
                  <select
                    value={form.format}
                    onChange={(e) => setForm({ ...form, format: e.target.value as ProfessorManualFormat })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  >
                    {formatOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-sm font-medium text-gray-700">Texto de apoio no sistema</span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="min-h-[110px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Frase curta e orientativa para o momento da ação."
                />
              </label>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Ponto do produto</span>
                  <input
                    value={form.productArea}
                    onChange={(e) => setForm({ ...form, productArea: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                    placeholder="Ex: workout_builder_liberacao"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Momento da orientação</span>
                  <input
                    value={form.productMoment || ''}
                    onChange={(e) => setForm({ ...form, productMoment: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                    placeholder="Ex: antes de liberar a semana"
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Label do link</span>
                <input
                  value={form.linkLabel || ''}
                  onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  placeholder="Ex: Abrir cadastro do manual"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Link</span>
                <input
                  value={form.linkHref || ''}
                  onChange={(e) => setForm({ ...form, linkHref: e.target.value })}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  placeholder="/settings/professor-manual?context=avaliacao_fisica"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive ?? true}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              Item ativo
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" isLoading={saving}>
                {editingId ? 'Salvar alterações' : 'Cadastrar item'}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar edição
                </Button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.context}
              onChange={(e) => setFilters({ ...filters, context: e.target.value })}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="all">Todos os contextos</option>
              {contextOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.format}
              onChange={(e) => setFilters({ ...filters, format: e.target.value })}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="all">Todos os formatos</option>
              {formatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="h-10 min-w-[260px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
              placeholder="Buscar por setor, item, frase, título, serviço ou ponto do produto"
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Setor</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Frase</th>
                  <th className="px-3 py-2">Aplicação</th>
                  <th className="px-3 py-2 text-center">Ordem</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                      Nenhum item encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="border-b align-top">
                      <td className="px-3 py-3 text-gray-700">
                        <div>{item.setor || '-'}</div>
                        {item.servicoContratado ? (
                          <div className="mt-1 text-xs text-muted-foreground">{item.servicoContratado}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{item.item || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[420px] text-sm text-gray-700">{item.frase || '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        <div className="font-semibold text-gray-900">{item.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.content}</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {contextOptions.find((option) => option.value === item.context)?.label || item.context}
                          {' | '}
                          {formatOptions.find((option) => option.value === item.format)?.label || item.format}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.productArea}</div>
                        {item.productMoment ? (
                          <div className="mt-1 text-xs text-muted-foreground">{item.productMoment}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{item.order}</td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {item.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(item)}>
                            Editar
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
