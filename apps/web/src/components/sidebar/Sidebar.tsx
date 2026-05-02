import { useEffect, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '../ui/Button';
import { Sidebar as SidebarShell } from '../ui/Sidebar';
import { SidebarMenuItem } from './SidebarMenuItem';
import type { SidebarNavItem } from './types';
import { useAuthStore } from '../../stores/useAuthStore';

interface AppSidebarProps {
  items: SidebarNavItem[];
  currentPath: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}

function itemMatchesPath(item: SidebarNavItem, currentPath: string) {
  if (!item.path) return false;
  return item.children?.length ? currentPath === item.path : currentPath === item.path || currentPath.startsWith(`${item.path}/`);
}

function collectParentIdsWithActiveChild(items: SidebarNavItem[], currentPath: string, acc: Set<string>): boolean {
  let foundActive = false;

  for (const item of items) {
    const hasActiveDescendant = collectParentIdsWithActiveChild(item.children || [], currentPath, acc);
    const isActive = itemMatchesPath(item, currentPath);

    if (hasActiveDescendant) {
      acc.add(item.id);
    }

    if (isActive || hasActiveDescendant) {
      foundActive = true;
    }
  }

  return foundActive;
}

export function AppSidebar({
  items,
  currentPath,
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onNavigate,
}: AppSidebarProps) {
  const { user } = useAuthStore();

  const companyDisplayName = user?.professor?.contract?.tradeName?.trim()
    || user?.professor?.contract?.name?.trim()
    || 'Sistema Acesso';

  const defaultOpenMap = useMemo(() => {
    const opened = new Set<string>();
    collectParentIdsWithActiveChild(items, currentPath, opened);
    return Object.fromEntries(Array.from(opened).map((id) => [id, true]));
  }, [items, currentPath]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(defaultOpenMap);

  useEffect(() => {
    setOpenMap((prev) => ({ ...defaultOpenMap, ...prev }));
  }, [defaultOpenMap]);

  const handleToggle = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <SidebarShell collapsible collapsed={collapsed} mobileOpen={mobileOpen}>
      <div className="flex h-full min-h-0 flex-col">
        <div className={cn('flex flex-col border-b border-white/10 px-4 py-4', collapsed && 'items-center')}>
          {!collapsed && (
            <span className="mt-3 text-sm font-semibold tracking-tight text-sidebar-foreground">{companyDisplayName}</span>
          )}
        </div>

        <div className="hidden items-center justify-between border-b border-white/10 px-3 py-3 lg:flex">
          <span className={cn('text-sm font-semibold text-sidebar-foreground/90', collapsed && 'sr-only')}>Menu</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="text-sidebar-foreground hover:bg-sidebar-muted hover:text-sidebar-foreground"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
          {items.map((item) => (
            <SidebarMenuItem
              key={item.id}
              item={item}
              currentPath={currentPath}
              collapsed={collapsed}
              isOpen={!!openMap[item.id]}
              openMap={openMap}
              onToggle={handleToggle}
              onNavigate={onNavigate}
              level={0}
            />
          ))}
        </nav>
      </div>
    </SidebarShell>
  );
}
