import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CheckCircle2, Lock, Plus, Search, Shield, User, XCircle } from 'lucide-react';
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

// \u2500\u2500\u2500 Types \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

type PermissionSelection = {
  screens: string[];
  blocks: string[];
  dataScopes: Record<string, AccessDataScope>;
};

type PermissionFilter = 'all' | 'enabled' | 'disabled';

// \u2500\u2500\u2500 Constants \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const fallbackPermissions = DEFAULT_ACCESS_BY_PROFILE_CODE[FALLBACK_ACCESS_PROFILE_CODE];

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
  ACCESS_SCREEN_CATALOG.map((screen) => [
    screen.key,
    screen as {
      key: string;
      label: string;
      description?: string;
      shortDescription?: string;
      summary?: string;
    },
  ]),
);

function getScreenShortDescription(screenKey: string): string | null {
  const screen = screenCatalogByKey.get(screenKey);
  if (!screen) return null;
  return screen.shortDescription ?? screen.description ?? screen.summary ?? null;
}

// \u2500\u2500\u2500 Menu \u2192 Permission tree builder \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// \u2500\u2500\u2500 Helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function cleanOrphanSubHeaders(rows: PermRow[]): PermRow[] {
  const result: PermRow[] = [];
  const pending: (PermRow & { kind: 'sub-header' })[] = [];

  for (const row of rows) {
    if (row.kind === 'sub-header') {
      while (pending.length > 0 && pending[pending.length - 1].depth >= row.depth) {
        pending.pop();
      }
      pending.push(row as PermRow & { kind: 'sub-header' });
    } else {
      result.push(...pending.splice(0));
      result.push(row);
    }
  }

  return result;
}

function createOpenGroupState(): Record<string, boolean> {
  return Object.fromEntries(permissionTreeGroups.map((g) => [g.id, true]));
}

function createOpenScreenState(): Record<string, boolean> {
  return Object.fromEntries(
    permissionTreeGroups.flatMap((g) =>
      g.rows
        .filter((r): r is Extract<PermRow, { kind: 'screen' }> => r.kind === 'screen')
        .filter((r) => ACCESS_BLOCK_CATALOG.some((b) => (b.screenKey as string) === r.screenKey))
        .map((r) => [r.screenKey, true]),
    ),
  );
}

function getDefaultDataScopes(profileCode?: string): Record<string, AccessDataScope> {
  const profileDefaults =
    (profileCode &&
      DEFAULT_ACCESS_BY_PROFILE_CODE[profileCode as keyof typeof DEFAULT_ACCESS_BY_PROFILE_CODE]) ||
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
    .filter((p) => p.canView && !p.blockKey)
    .map((p) => p.screenKey);
  const defaults = getDefaultDataScopes(item.code);

  return {
    screens,
    blocks: item.accessPermissions
      .filter((p) => p.canView && p.blockKey && screens.includes(p.screenKey))
      .map((p) => p.blockKey as string),
    dataScopes: Object.fromEntries(
      ACCESS_DATA_SCOPE_SCREEN_KEYS.map((screenKey) => {
        const p = item.accessPermissions?.find(
          (entry) => entry.screenKey === screenKey && !entry.blockKey,
        );
        const dataScope = isAccessDataScope(p?.dataScope) ? p.dataScope : defaults[screenKey];
        return [screenKey, dataScope ?? 'self'];
      }),
    ),
  };
}

function countPermissions(perm: PermissionSelection) {
  return {
    screens: perm.screens.length,
    blocks: perm.blocks.length,
    groups: permissionTreeGroups.filter((g) =>
      g.screenKeys.some((k) => perm.screens.includes(k)),
    ).length,
  };
}

const DEPTH_PAD: Record<number, string> = { 0: 'pl-0', 1: 'pl-4', 2: 'pl-8', 3: 'pl-12' };
function depthPad(depth: number): string {
  return DEPTH_PAD[Math.min(depth, 3)] ?? 'pl-12';
}

// \u2500\u2500\u2500 Sub-components \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function SkeletonList() {
  return (
    <div className="space-y-2 p-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <Shield className="h-8 w-8 text-primary/60" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{copy.selectFunctionPrompt}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.selectFunctionPromptHint}</p>
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 Main Component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export default function SettingsCollaboratorFunctions() {
  const loadUser = useAuthStore((state) => state.loadUser);
  const [items, setItems] = useState<CollaboratorFunctionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', isActive: true });
  const [permissions, setPermissions] = useState<PermissionSelection>(defaultPermissionSelection);
  const [savedPermissions, setSavedPermissions] = useState<PermissionSelection | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(createOpenGroupState);
  const [openScreens, setOpenScreens] = useState<Record<string, boolean>>(createOpenScreenState);
  const [permSearch, setPermSearch] = useState('');
  const [permFilter, setPermFilter] = useState<PermissionFilter>('all');
  const [fnSearch, setFnSearch] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  const hasUnsavedChanges = useMemo(() => {
    if (!savedPermissions) return isCreating;
    return JSON.stringify(permissions) !== JSON.stringify(savedPermissions);
  }, [permissions, savedPermissions, isCreating]);

  const permStats = useMemo(() => countPermissions(permissions), [permissions]);

  const filteredItems = useMemo(() => {
    if (!fnSearch.trim()) return items;
    const q = fnSearch.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, fnSearch]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [items, editingId],
  );

  const filteredGroups = useMemo((): PermTreeGroup[] => {
    return permissionTreeGroups
      .map((group) => {
        const filteredRows: PermRow[] = group.rows
          .map((row) => {
            if (row.kind === 'sub-header') return row;

            const screenChecked = permissions.screens.includes(row.screenKey);
            const matchesFilter =
              permFilter === 'all' ||
              (permFilter === 'enabled' && screenChecked) ||
              (permFilter === 'disabled' && !screenChecked);

            const blocks = ACCESS_BLOCK_CATALOG.filter(
              (b) => (b.screenKey as string) === row.screenKey,
            );
            const screenDescription = getScreenShortDescription(row.screenKey);
            const matchesSearch =
              !permSearch.trim() ||
              row.label.toLowerCase().includes(permSearch.toLowerCase()) ||
              (screenDescription?.toLowerCase().includes(permSearch.toLowerCase()) ?? false) ||
              blocks.some((b) => b.label.toLowerCase().includes(permSearch.toLowerCase()));

            return matchesSearch && matchesFilter ? row : null;
          })
          .filter((row): row is PermRow => row !== null);

        return { ...group, rows: cleanOrphanSubHeaders(filteredRows) };
      })
      .filter((g) => g.rows.some((r) => r.kind === 'screen'));
  }, [permSearch, permFilter, permissions.screens]);

  // \u2500\u2500 Data loading \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await collaboratorFunctionService.list();
      setItems(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadItems(); }, []);

  // \u2500\u2500 Editor state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const resetEditor = () => {
    setEditingId(null);
    setIsCreating(false);
    setForm({ name: '', isActive: true });
    setPermissions(defaultPermissionSelection);
    setSavedPermissions(null);
    setPermSearch('');
    setPermFilter('all');
    setSaveSuccess(false);
  };

  const handleSelectFunction = (item: CollaboratorFunctionOption) => {
    setEditingId(item.id);
    setIsCreating(false);
    setForm({ name: item.name, isActive: item.isActive });
    const sel = getPermissionSelection(item);
    setPermissions(sel);
    setSavedPermissions(sel);
    setPermSearch('');
    setPermFilter('all');
    setSaveSuccess(false);
  };

  const handleNewFunction = () => {
    setEditingId(null);
    setIsCreating(true);
    setForm({ name: '', isActive: true });
    setPermissions(defaultPermissionSelection);
    setSavedPermissions(null);
    setPermSearch('');
    setPermFilter('all');
    setSaveSuccess(false);
  };

  // \u2500\u2500 Permission mutators \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const toggleScreenPermission = (screenKey: string, checked: boolean) => {
    setPermissions((cur) => {
      const screenBlocks = ACCESS_BLOCK_CATALOG.filter(
        (b) => (b.screenKey as string) === screenKey,
      ).map((b) => b.key);
      return {
        screens: checked
          ? Array.from(new Set([...cur.screens, screenKey]))
          : cur.screens.filter((k) => k !== screenKey),
        blocks: checked
          ? cur.blocks
          : cur.blocks.filter((k) => !(screenBlocks as string[]).includes(k)),
        dataScopes: {
          ...cur.dataScopes,
          ...(checked && scopedScreenKeys.has(screenKey)
            ? { [screenKey]: cur.dataScopes[screenKey] ?? 'self' }
            : {}),
        },
      };
    });
  };

  const toggleBlockPermission = (screenKey: string, blockKey: string, checked: boolean) => {
    setPermissions((cur) => ({
      screens: checked ? Array.from(new Set([...cur.screens, screenKey])) : cur.screens,
      blocks: checked
        ? Array.from(new Set([...cur.blocks, blockKey]))
        : cur.blocks.filter((k) => k !== blockKey),
      dataScopes: cur.dataScopes,
    }));
  };

  const setDataScope = (screenKey: string, dataScope: AccessDataScope) => {
    setPermissions((cur) => ({
      ...cur,
      screens: Array.from(new Set([...cur.screens, screenKey])),
      dataScopes: { ...cur.dataScopes, [screenKey]: dataScope },
    }));
  };

  const toggleGroupAllScreens = (groupId: string, allow: boolean) => {
    const group = permissionTreeGroups.find((g) => g.id === groupId);
    if (!group) return;
    const gKeys = group.screenKeys;
    const gBlockKeys = ACCESS_BLOCK_CATALOG.filter((b) =>
      (gKeys as string[]).includes(b.screenKey as string),
    ).map((b) => b.key);

    setPermissions((cur) => ({
      screens: allow
        ? Array.from(new Set([...cur.screens, ...gKeys]))
        : cur.screens.filter((k) => !(gKeys as string[]).includes(k)),
      blocks: allow
        ? Array.from(new Set([...cur.blocks, ...gBlockKeys]))
        : cur.blocks.filter((k) => !(gBlockKeys as string[]).includes(k)),
      dataScopes: {
        ...cur.dataScopes,
        ...(allow
          ? Object.fromEntries(
              gKeys.filter((k) => scopedScreenKeys.has(k)).map((k) => [k, cur.dataScopes[k] ?? 'self']),
            )
          : {}),
      },
    }));
  };

  const selectAllPermissions = () => {
    setPermissions({
      screens: ACCESS_SCREEN_CATALOG.map((s) => s.key),
      blocks: ACCESS_BLOCK_CATALOG.map((b) => b.key),
      dataScopes: Object.fromEntries(
        ACCESS_DATA_SCOPE_SCREEN_KEYS.map((k) => [k, 'contract']),
      ) as Record<string, AccessDataScope>,
    });
  };

  const clearAllPermissions = () => setPermissions({ screens: [], blocks: [], dataScopes: {} });

  const expandPermissionTree = () => {
    setOpenGroups(createOpenGroupState());
    setOpenScreens(createOpenScreenState());
  };

  const collapsePermissionTree = () => {
    setOpenGroups(Object.fromEntries(permissionTreeGroups.map((g) => [g.id, false])));
    setOpenScreens(Object.fromEntries(Object.keys(createOpenScreenState()).map((k) => [k, false])));
  };

  const toggleGroup = (id: string) => setOpenGroups((cur) => ({ ...cur, [id]: !cur[id] }));
  const toggleScreen = (key: string) => setOpenScreens((cur) => ({ ...cur, [key]: !cur[key] }));

  // \u2500\u2500 Submit \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
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
      await loadUser();
      localStorage.setItem(ACCESS_REFRESH_SIGNAL_KEY, String(Date.now()));
      setSavedPermissions(permissions);
      setSaveSuccess(true);
      setIsCreating(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || copy.saveError);
    } finally {
      setSaving(false);
    }
  };

  // \u2500\u2500 Rendering \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const isEditing = editingId !== null || isCreating;
  const totalScreens = ACCESS_SCREEN_CATALOG.length;
  const totalBlocks = ACCESS_BLOCK_CATALOG.length;

  return (
    <div ref={topRef} className="flex flex-col h-full min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background px-6 py-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={loadItems} disabled={loading || saving}>
            {copy.refresh}
          </Button>
          <Button type="button" size="sm" onClick={handleNewFunction} disabled={saving}>
            <Plus size={16} />
            {copy.newFunction}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* LEFT: Functions list */}
        <aside className="flex flex-col border-b border-border lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="px-3 py-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={copy.searchFunctions}
                value={fnSearch}
                onChange={(e) => setFnSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <SkeletonList />
            ) : filteredItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {fnSearch ? copy.emptySearch : copy.empty}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const sel = getPermissionSelection(item);
                  const stats = countPermissions(sel);
                  const isSelected = item.id === editingId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectFunction(item)}
                        className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                              {item.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span className={`inline-flex items-center gap-1 ${item.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                {item.isActive ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                {item.isActive ? copy.activeStatus : copy.inactiveStatus}
                              </span>
                              <span className="opacity-40">&middot;</span>
                              <span>{item.isSystem ? copy.systemOrigin : copy.customOrigin}</span>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground shrink-0">
                            <User size={10} />
                            {stats.screens}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* RIGHT: Editor */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {!isEditing ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyEditor />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              {/* Sticky top bar */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {editingId ? copy.editTitle : copy.createTitle}
                    </span>
                    <span className="text-base font-semibold text-foreground leading-tight">
                      {form.name || <span className="text-muted-foreground italic">{copy.namePlaceholder}</span>}
                    </span>
                  </div>
                  {hasUnsavedChanges && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                      {copy.unsavedChanges}
                    </span>
                  )}
                  {saveSuccess && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={12} />
                      {copy.saveSuccess}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={resetEditor} disabled={saving}>
                    {copy.cancelButton}
                  </Button>
                  <Button type="submit" size="sm" isLoading={saving}>
                    {editingId ? copy.saveButton : copy.createButton}
                  </Button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">

                  {/* Function data card */}
                  <Card>
                    <CardContent className="pt-5 space-y-4">
                      <p className="text-sm font-semibold text-foreground">{copy.functionDetails}</p>
                      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                        <Input
                          label={copy.nameLabel}
                          value={form.name}
                          onChange={(e) => setForm((cur) => ({ ...cur, name: e.target.value }))}
                          placeholder={copy.namePlaceholder}
                        />
                        <div className="flex flex-col justify-end pb-0.5">
                          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={form.isActive}
                              onChange={(e) => setForm((cur) => ({ ...cur, isActive: e.target.checked }))}
                              className="h-4 w-4 accent-primary"
                            />
                            {copy.activeLabel}
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{copy.originLabel}</span>
                        <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                          {selectedItem?.isSystem ? copy.systemOrigin : copy.customOrigin}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Permission summary strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">
                        {permStats.screens}<span className="text-sm font-normal text-muted-foreground">/{totalScreens}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{copy.permissionSummaryScreens}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">
                        {permStats.blocks}<span className="text-sm font-normal text-muted-foreground">/{totalBlocks}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{copy.permissionSummaryBlocks}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">
                        {permStats.groups}<span className="text-sm font-normal text-muted-foreground">/{permissionTreeGroups.length}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{copy.groupsWithAccess}</p>
                    </div>
                  </div>

                  {/* Permission editor */}
                  <Card>
                    <CardContent className="pt-5 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{copy.permissionsTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{copy.permissionsDescription}</p>
                      </div>

                      {/* Search + filter row */}
                      <div className="flex flex-wrap gap-2">
                        <div className="relative flex-1 min-w-48">
                          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder={copy.searchPermissions}
                            value={permSearch}
                            onChange={(e) => setPermSearch(e.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <div className="flex rounded-md border border-border overflow-hidden">
                          {(['all', 'enabled', 'disabled'] as PermissionFilter[]).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setPermFilter(f)}
                              className={`px-3 py-1.5 text-xs font-medium transition-colors ${permFilter === f ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                            >
                              {f === 'all' ? copy.filterAll : f === 'enabled' ? copy.filterEnabled : copy.filterDisabled}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bulk actions */}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={selectAllPermissions}>{copy.selectAll}</Button>
                        <Button type="button" variant="outline" size="sm" onClick={clearAllPermissions}>{copy.clearAll}</Button>
                        <Button type="button" variant="outline" size="sm" onClick={expandPermissionTree}>{copy.expandAll}</Button>
                        <Button type="button" variant="outline" size="sm" onClick={collapsePermissionTree}>{copy.collapseAll}</Button>
                      </div>

                      {/* Permission tree */}
                      {filteredGroups.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{copy.noResults}</p>
                      ) : (
                        <div className="space-y-3">
                          {filteredGroups.map((group) => {
                            const enabledInGroup = group.screenKeys.filter((k) => permissions.screens.includes(k)).length;
                            const isGroupOpen = openGroups[group.id] ?? true;
                            const isInternal = group.id === 'internal';

                            return (
                              <div key={group.id} className="overflow-hidden rounded-lg border border-border">
                                {/* Group header */}
                                <div className={`flex items-center gap-2 px-4 py-2.5 ${isInternal ? 'bg-amber-50/60' : 'bg-muted/40'}`}>
                                  <button
                                    type="button"
                                    onClick={() => toggleGroup(group.id)}
                                    className="flex flex-1 items-center gap-2 text-left"
                                  >
                                    <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                                    {isInternal && <Lock size={13} className="shrink-0 text-amber-600" />}
                                    <span className={`text-xs font-semibold uppercase tracking-wider ${isInternal ? 'text-amber-700' : 'text-muted-foreground'}`}>
                                      {group.label}
                                    </span>
                                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border">
                                      {enabledInGroup} {copy.blocksOf} {group.screenKeys.length} {copy.filterEnabled.toLowerCase()}
                                    </span>
                                  </button>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button type="button" onClick={() => toggleGroupAllScreens(group.id, true)} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors font-medium">
                                      {copy.allowGroup}
                                    </button>
                                    <button type="button" onClick={() => toggleGroupAllScreens(group.id, false)} className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors font-medium">
                                      {copy.blockGroup}
                                    </button>
                                  </div>
                                </div>

                                {/* Rows */}
                                {isGroupOpen && (
                                  <div className="divide-y divide-border">
                                    {group.rows.map((row) => {
                                      if (row.kind === 'sub-header') {
                                        return (
                                          <div key={row.id} className={`${depthPad(row.depth)} bg-muted/20 px-4 py-2`}>
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                              {row.label}
                                            </span>
                                          </div>
                                        );
                                      }

                                      const { screenKey, label, depth } = row;
                                      const screenChecked = permissions.screens.includes(screenKey);
                                      const blocks = ACCESS_BLOCK_CATALOG.filter((b) => (b.screenKey as string) === screenKey);
                                      const hasBlocks = blocks.length > 0;
                                      const enabledBlocks = blocks.filter((b) => permissions.blocks.includes(b.key)).length;
                                      const screenOpen = openScreens[screenKey] ?? true;
                                      const shortDescription = getScreenShortDescription(screenKey);

                                      return (
                                        <div key={row.id} className="bg-background">
                                          <div className={`flex items-center gap-3 py-3 pr-4 ${depthPad(depth + 1)}`}>
                                            <input
                                              type="checkbox"
                                              id={`screen-${screenKey}`}
                                              checked={screenChecked}
                                              onChange={(e) => toggleScreenPermission(screenKey, e.target.checked)}
                                              className="h-4 w-4 accent-primary shrink-0"
                                            />
                                            <label htmlFor={`screen-${screenKey}`} className="flex-1 min-w-0 cursor-pointer">
                                              <span className="text-sm font-medium text-foreground">{label}</span>
                                              {shortDescription && (
                                                <span className="block text-xs text-muted-foreground">{shortDescription}</span>
                                              )}
                                              <span className="block text-[11px] text-muted-foreground">
                                                {screenKey}
                                              </span>
                                              {hasBlocks && (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                  {enabledBlocks} {copy.blocksOf} {blocks.length} {copy.blockCounterSuffix}
                                                </span>
                                              )}
                                            </label>
                                            {hasBlocks && (
                                              <button type="button" onClick={() => toggleScreen(screenKey)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                                                <ChevronDown size={14} className={`transition-transform ${screenOpen ? 'rotate-180' : ''}`} />
                                              </button>
                                            )}
                                          </div>

                                          {hasBlocks && screenOpen && (
                                            <div className="border-t border-border/60 bg-muted/20 px-4 pb-3 pt-2">
                                              <div className={`${depthPad(depth + 2)} space-y-2`}>
                                                {blocks.map((block) => (
                                                  <label key={block.key} className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input
                                                      type="checkbox"
                                                      checked={screenChecked && permissions.blocks.includes(block.key)}
                                                      disabled={!screenChecked}
                                                      onChange={(e) => toggleBlockPermission(screenKey, block.key, e.target.checked)}
                                                      className="h-3.5 w-3.5 accent-primary"
                                                    />
                                                    <span className="text-xs text-muted-foreground">{block.label}</span>
                                                  </label>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {scopedScreenKeys.has(screenKey) && screenChecked && (
                                            <div className="border-t border-border/60 bg-muted/20 px-4 pb-3 pt-2">
                                              <div className={`${depthPad(depth + 2)} space-y-1.5`}>
                                                <label className="block text-xs font-medium text-foreground">{copy.dataScopeLabel}</label>
                                                <select
                                                  value={permissions.dataScopes[screenKey] ?? 'self'}
                                                  onChange={(e) => setDataScope(screenKey, e.target.value as AccessDataScope)}
                                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                                                >
                                                  {ACCESS_DATA_SCOPE_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                      {copy.dataScopeOptions[opt.value]}
                                                    </option>
                                                  ))}
                                                </select>
                                                <p className="text-xs text-muted-foreground">{copy.dataScopeHelp}</p>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="h-4" />
                </div>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
