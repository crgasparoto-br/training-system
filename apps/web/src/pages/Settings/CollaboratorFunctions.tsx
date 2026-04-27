import { useEffect, useState } from 'react';
import { collaboratorFunctionService } from '../../services/collaborator-function.service';
import type { CollaboratorFunctionOption } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { settingsCollaboratorFunctionsCopy } from '../../i18n/ptBR';
 
const defaultForm = {
  name: '',
  isActive: true,
};

export default function SettingsCollaboratorFunctions() {
  const [items, setItems] = useState<CollaboratorFunctionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await collaboratorFunctionService.list();
      setItems(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsCollaboratorFunctionsCopy.loadError);
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

  const handleEdit = (item: CollaboratorFunctionOption) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      isActive: item.isActive,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await collaboratorFunctionService.update(editingId, {
          name: form.name,
          isActive: form.isActive,
        });
      } else {
        await collaboratorFunctionService.create({
          name: form.name,
          isActive: form.isActive,
        });
      }

      await loadItems();
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsCollaboratorFunctionsCopy.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{settingsCollaboratorFunctionsCopy.title}</h1>
          <p className="text-sm text-muted-foreground">{settingsCollaboratorFunctionsCopy.description}</p>
        </div>
        <Button type="button" variant="outline" onClick={loadItems} disabled={loading || saving}>
          {settingsCollaboratorFunctionsCopy.refresh}
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
              {editingId
                ? settingsCollaboratorFunctionsCopy.editTitle
                : settingsCollaboratorFunctionsCopy.createTitle}
            </CardTitle>
            <CardDescription>{settingsCollaboratorFunctionsCopy.formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                label={settingsCollaboratorFunctionsCopy.nameLabel}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={settingsCollaboratorFunctionsCopy.namePlaceholder}
              />

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isActive: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
                {settingsCollaboratorFunctionsCopy.activeLabel}
              </label>

              <div className="flex items-center gap-2">
                <Button type="submit" isLoading={saving}>
                  {editingId
                    ? settingsCollaboratorFunctionsCopy.saveButton
                    : settingsCollaboratorFunctionsCopy.createButton}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {settingsCollaboratorFunctionsCopy.cancelButton}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{settingsCollaboratorFunctionsCopy.listTitle}</CardTitle>
            <CardDescription>{settingsCollaboratorFunctionsCopy.listDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">{settingsCollaboratorFunctionsCopy.tableName}</th>
                    <th className="px-3 py-2">{settingsCollaboratorFunctionsCopy.tableCode}</th>
                    <th className="px-3 py-2 text-center">{settingsCollaboratorFunctionsCopy.tableStatus}</th>
                    <th className="px-3 py-2 text-center">{settingsCollaboratorFunctionsCopy.tableOrigin}</th>
                    <th className="px-3 py-2 text-right">{settingsCollaboratorFunctionsCopy.tableActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsCollaboratorFunctionsCopy.loading}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsCollaboratorFunctionsCopy.empty}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="px-3 py-2 font-medium text-foreground">{item.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.code}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              item.isActive
                                ? 'bg-success/10 text-success'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {item.isActive
                              ? settingsCollaboratorFunctionsCopy.activeStatus
                              : settingsCollaboratorFunctionsCopy.inactiveStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">
                          {item.isSystem
                            ? settingsCollaboratorFunctionsCopy.systemOrigin
                            : settingsCollaboratorFunctionsCopy.customOrigin}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="outline" onClick={() => handleEdit(item)}>
                            {settingsCollaboratorFunctionsCopy.editButton}
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
