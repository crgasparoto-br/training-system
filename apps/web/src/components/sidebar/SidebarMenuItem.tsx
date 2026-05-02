import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
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

  const triggerClassName = useMemo(
    () =>
      cn(
        'flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
        collapsed ? 'justify-center' : 'gap-3',
        level > 0 && !collapsed && 'py-2 text-xs',
        active || activeChild
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-muted hover:text-sidebar-foreground'
      ),
    [active, activeChild, collapsed, level]
  );

  if (!hasChildren && item.path) {
    const Icon = item.icon;
    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        className={triggerClassName}
        title={collapsed ? item.label : undefined}
      >
        {Icon ? <Icon size={18} className="shrink-0" /> : null}
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate">{item.label}</span>
            {item.description && level === 0 && (
              <span className="mt-0.5 block truncate text-[11px] font-normal text-sidebar-foreground/55">
                {item.description}
              </span>
            )}
          </span>
        )}
      </Link>
    );
  }

  const Icon = item.icon;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={triggerClassName}
        title={collapsed ? item.label : undefined}
      >
        <div className={cn('flex min-w-0 items-center', !collapsed && 'gap-3')}>
          {Icon ? <Icon size={18} className="shrink-0" /> : null}
          {!collapsed && (
            <span className="min-w-0 text-left">
              <span className="block truncate">{item.label}</span>
              {item.description && level === 0 && (
                <span className="mt-0.5 block truncate text-[11px] font-normal text-sidebar-foreground/55">
                  {item.description}
                </span>
              )}
            </span>
          )}
        </div>
        {!collapsed && (
          <ChevronDown
            size={16}
            className={cn('ml-auto shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
          />
        )}
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-in-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          collapsed && 'hidden'
        )}
      >
        <div
          className={cn(
            'min-h-0 overflow-hidden',
            isOpen && 'overflow-visible'
          )}
        >
          <div className={cn('flex flex-col gap-1 pb-1', level === 0 ? 'ml-9' : 'ml-4 border-l border-white/10 pl-3')}>
            {item.children?.map((child) => {
              const childActive = itemMatchesPath(child, currentPath);
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
                <Link
                  key={child.id}
                  to={child.path}
                  onClick={onNavigate}
                  className={cn(
                    'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                    childActive ? 'bg-sidebar-muted text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-muted hover:text-sidebar-foreground'
                  )}
                >
                  {child.label}
                </Link>
              ) : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
