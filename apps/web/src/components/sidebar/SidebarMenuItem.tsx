import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { SidebarNavItem } from './types';

interface SidebarMenuItemProps {
  item: SidebarNavItem;
  currentPath: string;
  collapsed: boolean;
  isOpen: boolean;
  openMap: Record<string, boolean>;
  onToggle: (id: string) => void;
  onNavigate?: () => void;
  level?: number;
}

function matchesPath(currentPath: string, path?: string) {
  if (!path) return false;
  return currentPath === path || currentPath.startsWith(`${path}/`);
}

function itemMatchesPath(item: SidebarNavItem, currentPath: string) {
  if (!item.path) return false;
  return item.children?.length ? currentPath === item.path : matchesPath(currentPath, item.path);
}

function hasActiveChild(item: SidebarNavItem, currentPath: string): boolean {
  return (item.children || []).some((child) => {
    if (itemMatchesPath(child, currentPath)) return true;
    return hasActiveChild(child, currentPath);
  });
}

export function SidebarMenuItem({
  item,
  currentPath,
  collapsed,
  isOpen,
  openMap,
  onToggle,
  onNavigate,
  level = 0,
}: SidebarMenuItemProps) {
  const hasChildren = !!item.children?.length;
  const active = itemMatchesPath(item, currentPath);
  const activeChild = hasChildren && hasActiveChild(item, currentPath);

  const Icon = item.icon;

  /* ── Leaf item (no children) ─────────────────────────────────────────── */
  if (!hasChildren && item.path) {
    if (level === 0) {
      return (
        <Link
          to={item.path}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
            collapsed ? 'justify-center' : 'gap-3',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-muted hover:text-sidebar-foreground',
          )}
        >
          {Icon && <Icon size={18} className="shrink-0" />}
          {!collapsed && <span className="block min-w-0 truncate">{item.label}</span>}
        </Link>
      );
    }

    /* leaf at level ≥ 1 */
    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        className={cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
          active
            ? 'bg-sidebar-accent/25 text-sidebar-foreground font-semibold'
            : 'text-sidebar-foreground/55 hover:bg-sidebar-muted hover:text-sidebar-foreground',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150',
            active
              ? 'bg-sidebar-accent-foreground'
              : 'bg-sidebar-foreground/25 group-hover:bg-sidebar-foreground/55',
          )}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  /* ── Level-0 parent (top-level section with icon) ────────────────────── */
  if (level === 0) {
    return (
      <div className="mb-1">
        <button
          type="button"
          onClick={() => hasChildren ? onToggle(item.id) : undefined}
          title={collapsed ? item.label : undefined}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all duration-150',
            collapsed ? 'justify-center' : 'gap-3',
            active || activeChild
              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
              : 'text-sidebar-foreground/85 hover:bg-sidebar-muted hover:text-sidebar-foreground',
          )}
        >
          {Icon && <Icon size={18} className="shrink-0" />}
          {!collapsed && (
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="block truncate">{item.label}</span>
              {item.description && (
                <span className="mt-0.5 block truncate text-[11px] font-normal opacity-55">
                  {item.description}
                </span>
              )}
            </span>
          )}
          {!collapsed && hasChildren && (
            <ChevronRight
              size={15}
              className={cn(
                'ml-auto shrink-0 transition-transform duration-200',
                isOpen && 'rotate-90',
              )}
            />
          )}
        </button>

        {/* Children panel */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-200 ease-in-out',
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            collapsed && 'hidden',
          )}
        >
          <div className={cn('min-h-0 overflow-hidden', isOpen && 'overflow-visible')}>
            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l-2 border-white/[0.08] pl-3 pb-1">
              {item.children?.map((child) => (
                <SidebarMenuItem
                  key={child.id}
                  item={child}
                  currentPath={currentPath}
                  collapsed={collapsed}
                  isOpen={!!openMap[child.id]}
                  openMap={openMap}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                  level={1}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Level-1+ section group (sub-header, no icon) ────────────────────── */
  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-all duration-150',
          activeChild
            ? 'text-sidebar-foreground/80'
            : 'text-sidebar-foreground/38 hover:text-sidebar-foreground/65',
        )}
      >
        <span className="flex-1 truncate text-[10px] font-bold uppercase tracking-[0.09em]">
          {item.label}
        </span>
        <ChevronRight
          size={11}
          className={cn(
            'shrink-0 transition-transform duration-200',
            isOpen && 'rotate-90',
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-in-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className={cn('min-h-0 overflow-hidden', isOpen && 'overflow-visible')}>
          <div className="ml-2 flex flex-col gap-0.5 border-l border-white/[0.07] pl-2.5 pb-1 pt-0.5">
            {item.children?.map((child) => {
              const childHasChildren = !!child.children?.length;
              if (childHasChildren) {
                return (
                  <SidebarMenuItem
                    key={child.id}
                    item={child}
                    currentPath={currentPath}
                    collapsed={collapsed}
                    isOpen={!!openMap[child.id]}
                    openMap={openMap}
                    onToggle={onToggle}
                    onNavigate={onNavigate}
                    level={level + 1}
                  />
                );
              }
              return child.path ? (
                <SidebarMenuItem
                  key={child.id}
                  item={child}
                  currentPath={currentPath}
                  collapsed={collapsed}
                  isOpen={false}
                  openMap={openMap}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                  level={level}
                />
              ) : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
