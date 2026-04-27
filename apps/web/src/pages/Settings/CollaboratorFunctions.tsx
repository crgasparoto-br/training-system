import { useEffect, useState } from 'react';
import { collaboratorFunctionService } from '../../services/collaborator-function.service';
import {
  ACCESS_BLOCK_CATALOG,
  ACCESS_SCREEN_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
  FALLBACK_ACCESS_PROFILE_CODE,
  type CollaboratorFunctionOption,
} from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { settingsCollaboratorFunctionsCopy } from '../../i18n/ptBR';

const defaultForm = {
  name: '',
  isActive: true,
};

type PermissionSelection = {
  screens: string[];
  blocks: string[];
};

const fallbackPermissions = DEFAULT_ACCESS_BY_PROFILE_CODE[FALLBACK_ACCESS_PROFILE_CODE];

const defaultPermissionSelection: PermissionSelection = {
  screens: [...fallbackPermissions.screens],
  blocks: [...fallbackPermissions.blocks],
};

function getPermissionSelection(item?: CollaboratorFunctionOption | null): PermissionSelection {
  if (!item?.accessPermissions?.length) {
    return defaultPermissionSelection;
  }

  return {
    screens: item.accessPermissions
      .filter((permission) => permission.canView && !permission.blockKey)
      .map((permission) => permission.screenKey),
    blocks: item.accessPermissions
      .filter((permission) => permission.canView && permission.blockKey)
      .map((permission) => permission.blockKey as string),
  };
}

export default function SettingsCollaboratorFunctions() {
  const [items, setItems] = useState<CollaboratorFunctionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [permissions, setPermissions] = useState(defaultPermissionSelection);

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
    setPermissions(defaultPermissionSelection);
  };

  const handleEdit = (item: CollaboratorFunctionOption) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      isActive: item.isActive,
    });
    setPermissions(getPermissionSelection(item));
  };

  const toggleScreenPermission = (screenKey: string, checked: boolean) => {
    setPermissions((current) => {
      const screenBlocks: string[] = ACCESS_BLOCK_CATALOG
        .filter((block) => block.screenKey === screenKey)
        .map((block) => block.key);

      return {
        screens: checked
          ? Array.from(new Set([...current.screens, screenKey]))
          : current.screens.filter((key) => key !== screenKey),
        blocks: checked
          ? current.blocks
          : current.blocks.filter((key) => !screenBlocks.includes(key)),
      };
    });
  };

  const toggleBlockPermission = (screenKey: string, blockKey: string, checked: boolean) => {
    setPermissions((current) => ({
      screens: checked
        ? Array.from(new Set([...current.screens, screenKey]))
        : current.screens,
      blocks: checked
        ? Array.from(new Set([...current.blocks, blockKey]))
        : current.blocks.filter((key) => key !== blockKey),
    }));
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
          permissions,
        });
      } else {
        await collaboratorFunctionService.create({
          name: form.name,
          isActive: form.isActive,
          permissions,
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

              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Permissões de acesso</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Defina quais telas e blocos internos ficam visíveis para este perfil.
                  </p>
                </div>

                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {ACCESS_SCREEN_CATALOG.map((screen) => {
                    const screenChecked = permissions.screens.includes(screen.key);
                    const blocks = ACCESS_BLOCK_CATALOG.filter(
                      (block) => block.screenKey === screen.key
                    );

                    return (
                      <div key={screen.key} className="rounded-md border border-border bg-background p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <input
                            type="checkbox"
                            checked={screenChecked}
                            onChange={(event) =>
                              toggleScreenPermission(screen.key, event.target.checked)
                            }
                            className="h-4 w-4"
                          />
                          {screen.label}
                        </label>

                        {blocks.length > 0 && (
                          <div className="mt-3 space-y-2 border-l border-border pl-4">
                            {blocks.map((block) => (
                              <label
                                key={block.key}
                                className="flex items-center gap-2 text-xs text-muted-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={permissions.blocks.includes(block.key)}
                                  disabled={!screenChecked}
                                  onChange={(event) =>
                                    toggleBlockPermission(
                                      screen.key,
                                      block.key,
                                      event.target.checked
                                    )
                                  }
                                  className="h-4 w-4"
                                />
                                {block.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

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
                    <th className="px-3 py-2 text-center">{settingsCollaboratorFunctionsCopy.tableStatus}</th>
                    <th className="px-3 py-2 text-center">{settingsCollaboratorFunctionsCopy.tableOrigin}</th>
                    <th className="px-3 py-2 text-right">{settingsCollaboratorFunctionsCopy.tableActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsCollaboratorFunctionsCopy.loading}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsCollaboratorFunctionsCopy.empty}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="px-3 py-2 font-medium text-foreground">{item.name}</td>
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
