import { useEffect, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '../ui/Button';
import { Sidebar as SidebarShell } from '../ui/Sidebar';
import { SidebarMenuItem } from './SidebarMenuItem';
import type { SidebarNavItem } from './types';

interface AppSidebarProps {
  items: SidebarNavItem[];
  currentPath: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}

function collectParentIdsWithActiveChild(items: SidebarNavItem[], currentPath: string, acc: Set<string>) {
  for (const item of items) {
    const hasDirectActiveChild = (item.children || []).some((child) =>
      child.path ? currentPath === child.path || currentPath.startsWith(`${child.path}/`) : false
    );

    if (hasDirectActiveChild) acc.add(item.id);

    if (item.children?.length) {
      collectParentIdsWithActiveChild(item.children, currentPath, acc);
    }
  }
}

export function AppSidebar({
  items,
  currentPath,
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onNavigate,
}: AppSidebarProps) {
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
      <div className="flex h-full flex-col">
        <div className="hidden items-center justify-between border-b px-3 py-3 lg:flex">
          <span className={cn('text-sm font-semibold', collapsed && 'sr-only')}>Menu</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </Button>
        </div>

        <nav className="flex flex-col gap-2 p-3">
          {items.map((item) => (
            <SidebarMenuItem
              key={item.id}
              item={item}
              currentPath={currentPath}
              collapsed={collapsed}
              isOpen={!!openMap[item.id]}
              onToggle={handleToggle}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>
    </SidebarShell>
  );
}
