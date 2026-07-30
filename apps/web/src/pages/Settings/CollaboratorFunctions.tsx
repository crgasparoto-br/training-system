import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  User,
  XCircle,
} from 'lucide-react';
import { collaboratorFunctionService } from '../../services/collaborator-function.service';
import {
  ACCESS_BLOCK_CATALOG,
  ACCESS_DATA_SCOPE_OPTIONS,
  ACCESS_DATA_SCOPE_SCREEN_KEYS,
  ACCESS_SCREEN_CATALOG,
  DEFAULT_ACCESS_BY_PROFILE_CODE,
  FALLBACK_ACCESS_PROFILE_CODE,
  type AccessDataScope,
  type CollaboratorFunctionOption,
} from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  permissionTreeGroups,
  type PermissionTreeGroup as PermTreeGroup,
  type PermissionTreeRow as PermRow,
} from '../../navigation/sidebarMenu';
import { settingsCollaboratorFunctionsCopy as copy } from '../../i18n/ptBR';

type PermissionSelection = {
  screens: string[];
  blocks: string[];
  dataScopes: Record<string, AccessDataScope>;
};

type PermissionFilter = 'all' | 'enabled' | 'disabled';
type EditorTab = 'details' | 'access' | 'summary';
type FunctionForm = { name: string; isActive: boolean };

const layoutCopy = {
  tabs: { details: 'Dados gerais', access: 'Acessos', summary: 'Resumo' },
  backToFunctions: 'Voltar para funções',
  functionListLabel: 'Funções disponíveis',
  editorLabel: 'Configuração da função',
  accessOverview: 'Configure os módulos e refine telas, blocos e alcance dos dados.',
  summaryDescription: 'Revise a função antes de salvar as alterações.',
  statusTitle: 'Situação',
  originTitle: 'Origem da função',
  accessTitle: 'Cobertura de acesso',
  dataScopeTitle: 'Alcance dos dados',
  noScopedScreens: 'Nenhuma tela com alcance de dados está liberada.',
  noAccessWarning: 'Esta função ficará sem acesso às telas do sistema.',
  activeHelp: 'Funções inativas não ficam disponíveis para novos vínculos de colaboradores.',
  systemHelp: 'Funções padrão podem ter regras de negócio associadas. Revise os acessos antes de salvar.',
  customHelp: 'Função personalizada deste contrato.',
  technicalIdentifier: 'Ver identificador técnico',
  groupActions: 'Mais ações',
  discardConfirm: 'Existem alterações não salvas. Deseja descartá-las?',
  clearConfirm: 'Deseja remover todas as permissões desta função?',
  openFunction: 'Abrir função',
  screensEnabled: 'telas liberadas',
  areasEnabled: 'áreas com acesso',
  internalArea: 'Área interna',
} as const;

const fallbackPermissions = DEFAULT_ACCESS_BY_PROFILE_CODE[FALLBACK_ACCESS_PROFILE_CODE];
const emptyForm: FunctionForm = { name: '', isActive: true };
const defaultPermissionSelection: PermissionSelection = {
  screens: [...fallbackPermissions.screens],
  blocks: [...fallbackPermissions.blocks],
  dataScopes: { ...(fallbackPermissions.dataScopes ?? {}) },
};
const ACCESS_REFRESH_SIGNAL_KEY = 'auth-permissions-updated-at';
const scopedScreenKeys = new Set<string>(ACCESS_DATA_SCOPE_SCREEN_KEYS);
const screenCatalogByKey = new Map<string, {
  key: string;
  label: string;
  description?: string;
  shortDescription?: string;
  summary?: string;
}>(
  ACCESS_SCREEN_CATALOG.map((screen) => [screen.key, screen]),
);

function getScreenShortDescription(screenKey: string): string | null {
  const screen = screenCatalogByKey.get(screenKey);
  return screen?.shortDescription ?? screen?.description ?? screen?.summary ?? null;
}

function cleanOrphanSubHeaders(rows: PermRow[]): PermRow[] {
  const result: PermRow[] = [];
  const pending: (PermRow & { kind: 'sub-header' })[] = [];
  for (const row of rows) {
    if (row.kind === 'sub-header') {
      while (pending.length > 0 && pending[pending.length - 1].depth >= row.depth) pending.pop();
      pending.push(row);
    } else {
      result.push(...pending.splice(0));
      result.push(row);
    }
  }
  return result;
}

function createOpenGroupState(firstGroupId = permissionTreeGroups[0]?.id): Record<string, boolean> {
  return Object.fromEntries(permissionTreeGroups.map((group) => [group.id, group.id === firstGroupId]));
}

function createOpenScreenState(): Record<string, boolean> {
  return Object.fromEntries(
    permissionTreeGroups.flatMap((group) =>
      group.rows
        .filter((row): row is Extract<PermRow, { kind: 'screen' }> => row.kind === 'screen')
        .filter((row) => ACCESS_BLOCK_CATALOG.some((block) => block.screenKey === row.screenKey))
        .map((row) => [row.screenKey, false]),
    ),
  );
}

function getDefaultDataScopes(profileCode?: string): Record<string, AccessDataScope> {
  const profileDefaults =
    (profileCode && DEFAULT_ACCESS_BY_PROFILE_CODE[profileCode as keyof typeof DEFAULT_ACCESS_BY_PROFILE_CODE]) ||
    fallbackPermissions;
  return { ...(profileDefaults.dataScopes ?? fallbackPermissions.dataScopes ?? {}) };
}

function isAccessDataScope(value: unknown): value is AccessDataScope {
  return value === 'self' || value === 'managed' || value === 'contract';
}

function getPermissionSelection(item?: CollaboratorFunctionOption | null): PermissionSelection {
  if (!item?.accessPermissions?.length) {
    return { ...defaultPermissionSelection, dataScopes: getDefaultDataScopes(item?.code) };
  }
  const screens = item.accessPermissions
    .filter((permission) => permission.canView && !permission.blockKey)
    .map((permission) => permission.screenKey);
  const defaults = getDefaultDataScopes(item.code);
  return {
    screens,
    blocks: item.accessPermissions
      .filter((permission) => permission.canView && permission.blockKey && screens.includes(permission.screenKey))
      .map((permission) => permission.blockKey as string),
    dataScopes: Object.fromEntries(
      ACCESS_DATA_SCOPE_SCREEN_KEYS.map((screenKey) => {
        const permission = item.accessPermissions?.find(
          (entry) => entry.screenKey === screenKey && !entry.blockKey,
        );
        const dataScope = isAccessDataScope(permission?.dataScope) ? permission.dataScope : defaults[screenKey];
        return [screenKey, dataScope ?? 'self'];
      }),
    ),
  };
}

function countPermissions(permissions: PermissionSelection) {
  return {
    screens: permissions.screens.length,
    blocks: permissions.blocks.length,
    groups: permissionTreeGroups.filter((group) =>
      group.screenKeys.some((key) => permissions.screens.includes(key)),
    ).length,
  };
}

const DEPTH_PAD: Record<number, string> = { 0: 'pl-0', 1: 'pl-4', 2: 'pl-8', 3: 'pl-12' };
const depthPad = (depth: number) => DEPTH_PAD[Math.min(depth, 3)] ?? 'pl-12';

function SkeletonList() {
  return (
    <div className="space-y-2 p-3" aria-label={copy.loading}>
      {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <Shield className="h-8 w-8 text-primary/60" aria-hidden="true" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{copy.selectFunctionPrompt}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.selectFunctionPromptHint}</p>
      </div>
    </div>
  );
}

export default function SettingsCollaboratorFunctions() {
  const loadUser = useAuthStore((state) => state.loadUser);
  const [items, setItems] = useState<CollaboratorFunctionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FunctionForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<FunctionForm | null>(null);
  const [permissions, setPermissions] = useState<PermissionSelection>(defaultPermissionSelection);
  const [savedPermissions, setSavedPermissions] = useState<PermissionSelection | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(createOpenGroupState);
  const [openScreens, setOpenScreens] = useState<Record<string, boolean>>(createOpenScreenState);
  const [permSearch, setPermSearch] = useState('');
  const [permFilter, setPermFilter] = useState<PermissionFilter>('all');
  const [fnSearch, setFnSearch] = useState('');
  const [activeTab, setActiveTab] = useState<EditorTab>('details');
  const topRef = useRef<HTMLDivElement>(null);

  const hasUnsavedChanges = useMemo(() => {
    if (isCreating) {
      return form.name.trim().length > 0 || form.isActive !== emptyForm.isActive ||
        JSON.stringify(permissions) !== JSON.stringify(defaultPermissionSelection);
    }
    if (!savedForm || !savedPermissions) return false;
    return JSON.stringify(form) !== JSON.stringify(savedForm) ||
      JSON.stringify(permissions) !== JSON.stringify(savedPermissions);
  }, [form, isCreating, permissions, savedForm, savedPermissions]);

  const permissionStats = useMemo(() => countPermissions(permissions), [permissions]);
  const filteredItems = useMemo(() => {
    if (!fnSearch.trim()) return items;
    const query = fnSearch.toLocaleLowerCase('pt-BR');
    return items.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(query));
  }, [fnSearch, items]);
  const selectedItem = useMemo(() => items.find((item) => item.id === editingId) ?? null, [editingId, items]);

  const filteredGroups = useMemo((): PermTreeGroup[] => {
    const query = permSearch.trim().toLocaleLowerCase('pt-BR');
    return permissionTreeGroups
      .map((group) => {
        const filteredRows = group.rows
          .map((row) => {
            if (row.kind === 'sub-header') return row;
            const screenChecked = permissions.screens.includes(row.screenKey);
            const matchesFilter = permFilter === 'all' ||
              (permFilter === 'enabled' && screenChecked) ||
              (permFilter === 'disabled' && !screenChecked);
            const blocks = ACCESS_BLOCK_CATALOG.filter((block) => block.screenKey === row.screenKey);
            const description = getScreenShortDescription(row.screenKey);
            const matchesSearch = !query || row.label.toLocaleLowerCase('pt-BR').includes(query) ||
              row.screenKey.toLocaleLowerCase('pt-BR').includes(query) ||
              (description?.toLocaleLowerCase('pt-BR').includes(query) ?? false) ||
              blocks.some((block) => block.label.toLocaleLowerCase('pt-BR').includes(query));
            return matchesSearch && matchesFilter ? row : null;
          })
          .filter((row): row is PermRow => row !== null);
        return { ...group, rows: cleanOrphanSubHeaders(filteredRows) };
      })
      .filter((group) => group.rows.some((row) => row.kind === 'screen'));
  }, [permFilter, permSearch, permissions.screens]);

  const scopedAccessSummary = useMemo(() =>
    ACCESS_DATA_SCOPE_SCREEN_KEYS.filter((screenKey) => permissions.screens.includes(screenKey)).map((screenKey) => ({
      screenKey,
      label: screenCatalogByKey.get(screenKey)?.label ?? screenKey,
      scope: permissions.dataScopes[screenKey] ?? 'self',
    })), [permissions.dataScopes, permissions.screens]);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await collaboratorFunctionService.list());
    } catch (loadError: any) {
      setError(loadError?.response?.data?.error || copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadItems(); }, []);
  useEffect(() => {
    if (!permSearch.trim() || filteredGroups.length === 0) return;
    setOpenGroups(Object.fromEntries(
      permissionTreeGroups.map((group) => [group.id, filteredGroups.some((item) => item.id === group.id)]),
    ));
  }, [filteredGroups, permSearch]);

  const resetEditorState = () => {
    setEditingId(null);
    setIsCreating(false);
    setForm(emptyForm);
    setSavedForm(null);
    setPermissions(defaultPermissionSelection);
    setSavedPermissions(null);
    setPermSearch('');
    setPermFilter('all');
    setSaveSuccess(false);
    setActiveTab('details');
    setOpenGroups(createOpenGroupState());
    setOpenScreens(createOpenScreenState());
  };

  const requestCloseEditor = () => {
    if (hasUnsavedChanges && !window.confirm(layoutCopy.discardConfirm)) return;
    resetEditorState();
  };

  const handleSelectFunction = (item: CollaboratorFunctionOption) => {
    if (hasUnsavedChanges && !window.confirm(layoutCopy.discardConfirm)) return;
    const nextForm = { name: item.name, isActive: item.isActive };
    const nextPermissions = getPermissionSelection(item);
    setEditingId(item.id);
    setIsCreating(false);
    setForm(nextForm);
    setSavedForm(nextForm);
    setPermissions(nextPermissions);
    setSavedPermissions(nextPermissions);
    setPermSearch('');
    setPermFilter('all');
    setSaveSuccess(false);
    setActiveTab('details');
    setOpenGroups(createOpenGroupState());
    setOpenScreens(createOpenScreenState());
  };

  const handleNewFunction = () => {
    if (hasUnsavedChanges && !window.confirm(layoutCopy.discardConfirm)) return;
    setEditingId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setSavedForm(null);
    setPermissions(defaultPermissionSelection);
    setSavedPermissions(null);
    setPermSearch('');
    setPermFilter('all');
    setSaveSuccess(false);
    setActiveTab('details');
    setOpenGroups(createOpenGroupState());
    setOpenScreens(createOpenScreenState());
  };

  const toggleScreenPermission = (screenKey: string, checked: boolean) => {
    setPermissions((current) => {
      const screenBlocks: string[] = ACCESS_BLOCK_CATALOG
        .filter((block) => block.screenKey === screenKey)
        .map((block) => block.key);
      return {
        screens: checked ? Array.from(new Set([...current.screens, screenKey])) : current.screens.filter((key) => key !== screenKey),
        blocks: checked ? current.blocks : current.blocks.filter((key) => !screenBlocks.includes(key)),
        dataScopes: {
          ...current.dataScopes,
          ...(checked && scopedScreenKeys.has(screenKey) ? { [screenKey]: current.dataScopes[screenKey] ?? 'self' } : {}),
        },
      };
    });
  };

  const toggleBlockPermission = (screenKey: string, blockKey: string, checked: boolean) => {
    setPermissions((current) => ({
      screens: checked ? Array.from(new Set([...current.screens, screenKey])) : current.screens,
      blocks: checked ? Array.from(new Set([...current.blocks, blockKey])) : current.blocks.filter((key) => key !== blockKey),
      dataScopes: current.dataScopes,
    }));
  };

  const setDataScope = (screenKey: string, dataScope: AccessDataScope) => {
    setPermissions((current) => ({
      ...current,
      screens: Array.from(new Set([...current.screens, screenKey])),
      dataScopes: { ...current.dataScopes, [screenKey]: dataScope },
    }));
  };

  const toggleGroupAllScreens = (groupId: string, allow: boolean) => {
    const group = permissionTreeGroups.find((item) => item.id === groupId);
    if (!group) return;
    const groupKeys = [...group.screenKeys];
    const groupBlockKeys: string[] = ACCESS_BLOCK_CATALOG
      .filter((block) => groupKeys.includes(block.screenKey))
      .map((block) => block.key);
    setPermissions((current) => ({
      screens: allow ? Array.from(new Set([...current.screens, ...groupKeys])) : current.screens.filter((key) => !groupKeys.includes(key)),
      blocks: allow ? Array.from(new Set([...current.blocks, ...groupBlockKeys])) : current.blocks.filter((key) => !groupBlockKeys.includes(key)),
      dataScopes: {
        ...current.dataScopes,
        ...(allow ? Object.fromEntries(
          groupKeys.filter((key) => scopedScreenKeys.has(key)).map((key) => [key, current.dataScopes[key] ?? 'self']),
        ) : {}),
      },
    }));
  };

  const selectAllPermissions = () => setPermissions({
    screens: ACCESS_SCREEN_CATALOG.map((screen) => screen.key),
    blocks: ACCESS_BLOCK_CATALOG.map((block) => block.key),
    dataScopes: Object.fromEntries(ACCESS_DATA_SCOPE_SCREEN_KEYS.map((key) => [key, 'contract'])) as Record<string, AccessDataScope>,
  });
  const clearAllPermissions = () => {
    if (window.confirm(layoutCopy.clearConfirm)) setPermissions({ screens: [], blocks: [], dataScopes: {} });
  };
  const toggleGroup = (groupId: string) => setOpenGroups((current) => {
    const willOpen = !current[groupId];
    return Object.fromEntries(permissionTreeGroups.map((group) => [group.id, willOpen && group.id === groupId]));
  });
  const toggleScreen = (screenKey: string) => setOpenScreens((current) => ({ ...current, [screenKey]: !current[screenKey] }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setActiveTab('details');
      return;
    }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const payload = { name: form.name.trim(), isActive: form.isActive, permissions };
      const result = editingId
        ? await collaboratorFunctionService.update(editingId, payload)
        : await collaboratorFunctionService.create(payload);
      await loadItems();
      await loadUser();
      const serverForm = { name: result.name, isActive: result.isActive };
      const serverPermissions = getPermissionSelection(result);
      setEditingId(result.id);
      setForm(serverForm);
      setSavedForm(serverForm);
      setPermissions(serverPermissions);
      setSavedPermissions(serverPermissions);
      setIsCreating(false);
      localStorage.setItem(ACCESS_REFRESH_SIGNAL_KEY, String(Date.now()));
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (saveError: any) {
      setError(saveError?.response?.data?.error || copy.saveError);
    } finally {
      setSaving(false);
    }
  };

  const isEditing = editingId !== null || isCreating;
  const tabs: Array<{ id: EditorTab; label: string }> = [
    { id: 'details', label: layoutCopy.tabs.details },
    { id: 'access', label: layoutCopy.tabs.access },
    { id: 'summary', label: layoutCopy.tabs.summary },
  ];

  return (
    <div ref={topRef} className={`cf-layout flex min-h-screen flex-col ${isEditing ? 'cf-layout--editing' : ''}`}>
      <header className="cf-page-header flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background px-6 py-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={loadItems} disabled={loading || saving}>{copy.refresh}</Button>
          <Button type="button" size="sm" onClick={handleNewFunction} disabled={saving}>
            <Plus size={16} aria-hidden="true" />{copy.newFunction}
          </Button>
        </div>
      </header>

      {error && <div role="alert" className="mx-4 mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-6">{error}</div>}

      <div className="cf-workspace flex flex-1 min-h-0">
        <aside className={`cf-function-list flex min-h-0 w-80 shrink-0 flex-col border-r border-border bg-card ${isEditing ? 'cf-function-list--editor-open' : ''}`} aria-label={layoutCopy.functionListLabel}>
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" placeholder={copy.searchFunctions} value={fnSearch} onChange={(event) => setFnSearch(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <SkeletonList /> : filteredItems.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">{fnSearch ? copy.emptySearch : copy.empty}</div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const stats = countPermissions(getPermissionSelection(item));
                  const isSelected = item.id === editingId;
                  return (
                    <li key={item.id}>
                      <button type="button" onClick={() => handleSelectFunction(item)} aria-current={isSelected ? 'page' : undefined} aria-label={`${layoutCopy.openFunction}: ${item.name}`} className={`w-full px-4 py-4 text-left transition-colors hover:bg-accent focus-visible:bg-accent ${isSelected ? 'border-l-4 border-l-primary bg-primary/5 pl-3' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>{item.name}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span className={`inline-flex items-center gap-1 ${item.isActive ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                                {item.isActive ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
                                {item.isActive ? copy.activeStatus : copy.inactiveStatus}
                              </span>
                              <span aria-hidden="true">•</span><span>{item.isSystem ? copy.systemOrigin : copy.customOrigin}</span>
                            </div>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"><User size={11} aria-hidden="true" />{stats.screens}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className={`cf-editor min-w-0 flex-1 bg-background ${isEditing ? 'cf-editor--open' : 'cf-editor--empty'}`} aria-label={layoutCopy.editorLabel}>
          {!isEditing ? <div className="flex h-full items-center justify-center p-8"><EmptyEditor /></div> : (
            <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
              <div className="cf-editor-heading border-b border-border bg-card px-6 pt-5">
                <button type="button" onClick={requestCloseEditor} className="cf-mobile-back mb-3 hidden items-center gap-2 text-sm font-medium text-primary"><ArrowLeft size={16} aria-hidden="true" />{layoutCopy.backToFunctions}</button>
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{editingId ? copy.editTitle : copy.createTitle}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold text-foreground">{form.name || copy.namePlaceholder}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${form.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{form.isActive ? copy.activeStatus : copy.inactiveStatus}</span>
                    </div>
                  </div>
                  {saveSuccess && <div role="status" className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} aria-hidden="true" />{copy.saveSuccess}</div>}
                </div>
                <div role="tablist" aria-label="Seções da configuração" className="cf-tabs flex gap-1 overflow-x-auto">
                  {tabs.map((tab) => <button key={tab.id} id={`collaborator-function-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`collaborator-function-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>)}
                </div>
              </div>

              <div className="cf-editor-scroll flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-5xl p-6">
                  {activeTab === 'details' && (
                    <section id="collaborator-function-panel-details" role="tabpanel" aria-labelledby="collaborator-function-tab-details" className="space-y-5">
                      <Card><CardContent className="space-y-5 pt-6">
                        <div><h3 className="text-base font-semibold text-foreground">{copy.functionDetails}</h3><p className="mt-1 text-sm text-muted-foreground">{copy.formDescription}</p></div>
                        <Input label={copy.nameLabel} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={copy.namePlaceholder} required />
                        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-4">
                          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
                          <span><span className="block text-sm font-medium text-foreground">{copy.activeLabel}</span><span className="mt-0.5 block text-xs text-muted-foreground">{layoutCopy.activeHelp}</span></span>
                        </label>
                      </CardContent></Card>
                      <Card><CardContent className="pt-6"><div className="flex flex-wrap items-start justify-between gap-4">
                        <div><h3 className="text-base font-semibold text-foreground">{layoutCopy.originTitle}</h3><p className="mt-1 text-sm text-muted-foreground">{selectedItem?.isSystem ? layoutCopy.systemHelp : layoutCopy.customHelp}</p></div>
                        <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-foreground">{selectedItem?.isSystem ? copy.systemOrigin : copy.customOrigin}</span>
                      </div></CardContent></Card>
                    </section>
                  )}

                  {activeTab === 'access' && (
                    <section id="collaborator-function-panel-access" role="tabpanel" aria-labelledby="collaborator-function-tab-access" className="space-y-5">
                      <div><h3 className="text-base font-semibold text-foreground">{copy.permissionsTitle}</h3><p className="mt-1 text-sm text-muted-foreground">{layoutCopy.accessOverview}</p></div>
                      <div className="cf-access-toolbar sticky top-0 z-10 space-y-3 rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur">
                        <div className="flex flex-wrap gap-3">
                          <div className="relative min-w-56 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="search" placeholder={copy.searchPermissions} value={permSearch} onChange={(event) => setPermSearch(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                          <div className="inline-flex overflow-hidden rounded-lg border border-border" aria-label="Filtro de permissões">
                            {(['all', 'enabled', 'disabled'] as PermissionFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={permFilter === filter} onClick={() => setPermFilter(filter)} className={`min-h-10 px-3 text-xs font-medium transition-colors ${permFilter === filter ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>{filter === 'all' ? copy.filterAll : filter === 'enabled' ? copy.filterEnabled : copy.filterDisabled}</button>)}
                          </div>
                          <details className="cf-bulk-actions relative"><summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm hover:bg-accent"><MoreHorizontal size={16} aria-hidden="true" />{layoutCopy.groupActions}</summary><div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg"><button type="button" onClick={selectAllPermissions} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent">{copy.selectAll}</button><button type="button" onClick={clearAllPermissions} className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">{copy.clearAll}</button></div></details>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><strong className="text-foreground">{permissionStats.screens}</strong>/{ACCESS_SCREEN_CATALOG.length} {copy.permissionSummaryScreens}</span><span><strong className="text-foreground">{permissionStats.blocks}</strong>/{ACCESS_BLOCK_CATALOG.length} {copy.permissionSummaryBlocks}</span><span><strong className="text-foreground">{permissionStats.groups}</strong>/{permissionTreeGroups.length} {copy.groupsWithAccess}</span></div>
                      </div>

                      {filteredGroups.length === 0 ? <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{copy.noResults}</div> : (
                        <div className="space-y-3">
                          {filteredGroups.map((group) => {
                            const enabledInGroup = group.screenKeys.filter((key) => permissions.screens.includes(key)).length;
                            const isGroupOpen = openGroups[group.id] ?? false;
                            const isInternal = group.id === 'internal';
                            return (
                              <article key={group.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                                <div className={`flex items-center gap-3 p-4 ${isInternal ? 'bg-amber-50/70' : 'bg-muted/30'}`}>
                                  <button type="button" onClick={() => toggleGroup(group.id)} aria-expanded={isGroupOpen} aria-controls={`permission-group-${group.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                                    <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    {isInternal && <Lock size={15} className="shrink-0 text-amber-700" aria-label={layoutCopy.internalArea} />}
                                    <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-semibold ${isInternal ? 'text-amber-800' : 'text-foreground'}`}>{group.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{enabledInGroup} {copy.blocksOf} {group.screenKeys.length} {layoutCopy.screensEnabled}</span></span>
                                  </button>
                                  <details className="cf-group-actions relative shrink-0"><summary aria-label={`${layoutCopy.groupActions}: ${group.label}`} className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"><MoreHorizontal size={18} aria-hidden="true" /></summary><div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg"><button type="button" onClick={() => toggleGroupAllScreens(group.id, true)} className="w-full rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-primary/10">{copy.allowGroup}</button><button type="button" onClick={() => toggleGroupAllScreens(group.id, false)} className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">{copy.blockGroup}</button></div></details>
                                </div>
                                {isGroupOpen && <div id={`permission-group-${group.id}`} className="divide-y divide-border">
                                  {group.rows.map((row) => {
                                    if (row.kind === 'sub-header') return <div key={row.id} className={`${depthPad(row.depth)} bg-muted/20 px-4 py-2.5`}><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</span></div>;
                                    const { screenKey, label, depth } = row;
                                    const screenChecked = permissions.screens.includes(screenKey);
                                    const blocks = ACCESS_BLOCK_CATALOG.filter((block) => block.screenKey === screenKey);
                                    const hasDetails = blocks.length > 0 || scopedScreenKeys.has(screenKey);
                                    const enabledBlocks = blocks.filter((block) => permissions.blocks.includes(block.key)).length;
                                    const screenOpen = openScreens[screenKey] ?? false;
                                    const description = getScreenShortDescription(screenKey);
                                    return <div key={row.id} className="bg-background">
                                      <div className={`flex items-start gap-3 py-4 pr-4 ${depthPad(depth + 1)}`}>
                                        <input type="checkbox" id={`screen-${screenKey}`} checked={screenChecked} onChange={(event) => toggleScreenPermission(screenKey, event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
                                        <label htmlFor={`screen-${screenKey}`} className="min-w-0 flex-1 cursor-pointer"><span className="block text-sm font-medium text-foreground">{label}</span>{description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}{hasDetails && <span className="mt-1 block text-xs text-muted-foreground">{blocks.length > 0 ? `${enabledBlocks} ${copy.blocksOf} ${blocks.length} ${copy.blockCounterSuffix}` : copy.dataScopeLabel}</span>}</label>
                                        {hasDetails && <button type="button" onClick={() => toggleScreen(screenKey)} aria-expanded={screenOpen} aria-label={`${screenOpen ? copy.collapseAll : copy.expandAll}: ${label}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown size={16} className={`transition-transform ${screenOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></button>}
                                      </div>
                                      {hasDetails && screenOpen && <div className="space-y-4 border-t border-border/60 bg-muted/20 px-4 py-4">
                                        {blocks.length > 0 && <div className={`${depthPad(depth + 2)} space-y-2`}>{blocks.map((block) => <label key={block.key} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-background"><input type="checkbox" checked={screenChecked && permissions.blocks.includes(block.key)} disabled={!screenChecked} onChange={(event) => toggleBlockPermission(screenKey, block.key, event.target.checked)} className="h-4 w-4 accent-primary" /><span className="text-sm text-muted-foreground">{block.label}</span></label>)}</div>}
                                        {scopedScreenKeys.has(screenKey) && screenChecked && <div className={`${depthPad(depth + 2)} space-y-2`}><label htmlFor={`scope-${screenKey}`} className="block text-sm font-medium text-foreground">{copy.dataScopeLabel}</label><select id={`scope-${screenKey}`} value={permissions.dataScopes[screenKey] ?? 'self'} onChange={(event) => setDataScope(screenKey, event.target.value as AccessDataScope)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">{ACCESS_DATA_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{copy.dataScopeOptions[option.value]}</option>)}</select><p className="text-xs text-muted-foreground">{copy.dataScopeHelp}</p></div>}
                                        <details className={`${depthPad(depth + 2)} text-xs text-muted-foreground`}><summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">{layoutCopy.technicalIdentifier}</summary><code className="mt-2 inline-block rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground">{screenKey}</code></details>
                                      </div>}
                                    </div>;
                                  })}
                                </div>}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}

                  {activeTab === 'summary' && <section id="collaborator-function-panel-summary" role="tabpanel" aria-labelledby="collaborator-function-tab-summary" className="space-y-5">
                    <div><h3 className="text-base font-semibold text-foreground">{layoutCopy.tabs.summary}</h3><p className="mt-1 text-sm text-muted-foreground">{layoutCopy.summaryDescription}</p></div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card><CardContent className="pt-6"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{layoutCopy.statusTitle}</p><p className="mt-2 text-lg font-semibold text-foreground">{form.isActive ? copy.activeStatus : copy.inactiveStatus}</p></CardContent></Card>
                      <Card><CardContent className="pt-6"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{layoutCopy.originTitle}</p><p className="mt-2 text-lg font-semibold text-foreground">{selectedItem?.isSystem ? copy.systemOrigin : copy.customOrigin}</p></CardContent></Card>
                      <Card><CardContent className="pt-6"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{layoutCopy.accessTitle}</p><p className="mt-2 text-lg font-semibold text-foreground">{permissionStats.screens} {layoutCopy.screensEnabled}</p><p className="mt-1 text-xs text-muted-foreground">{permissionStats.groups} {layoutCopy.areasEnabled}</p></CardContent></Card>
                    </div>
                    <Card><CardContent className="space-y-4 pt-6"><h3 className="text-base font-semibold text-foreground">{layoutCopy.dataScopeTitle}</h3>{scopedAccessSummary.length === 0 ? <p className="text-sm text-muted-foreground">{layoutCopy.noScopedScreens}</p> : <dl className="divide-y divide-border">{scopedAccessSummary.map((item) => <div key={item.screenKey} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><dt className="text-sm font-medium text-foreground">{item.label}</dt><dd className="text-sm text-muted-foreground">{copy.dataScopeOptions[item.scope]}</dd></div>)}</dl>}</CardContent></Card>
                    {permissionStats.screens === 0 && <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{layoutCopy.noAccessWarning}</div>}
                  </section>}
                </div>
              </div>

              <div className="cf-save-bar flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
                <div aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{hasUnsavedChanges ? copy.unsavedChanges : saveSuccess ? copy.saveSuccess : ''}</div>
                <div className="flex w-full gap-2 sm:w-auto"><Button type="button" variant="outline" onClick={requestCloseEditor} disabled={saving} className="flex-1 sm:flex-none">{copy.cancelButton}</Button><Button type="submit" isLoading={saving} disabled={!form.name.trim()} className="flex-1 sm:flex-none">{editingId ? copy.saveButton : copy.createButton}</Button></div>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
