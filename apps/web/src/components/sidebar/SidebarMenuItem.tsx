import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { SidebarNavItem } from './types';

interface SidebarMenuItemProps {
  item: SidebarNavItem;
  currentPath: string;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onNavigate?: () => void;
}

function matchesPath(currentPath: string, path?: string) {
  if (!path) return false;
  return currentPath === path || currentPath.startsWith(`${path}/`);
}

function hasActiveChild(item: SidebarNavItem, currentPath: string): boolean {
  return (item.children || []).some((child) => {
    if (matchesPath(currentPath, child.path)) return true;
    return hasActiveChild(child, currentPath);
  });
}

export function SidebarMenuItem({
  item,
  currentPath,
  collapsed,
  isOpen,
  onToggle,
  onNavigate,
}: SidebarMenuItemProps) {
  const hasChildren = !!item.children?.length;
  const active = matchesPath(currentPath, item.path);
  const activeChild = hasChildren && hasActiveChild(item, currentPath);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState('0px');

  useEffect(() => {
    if (!hasChildren || collapsed) {
      setMaxHeight('0px');
      return;
    }
    setMaxHeight(isOpen ? `${contentRef.current?.scrollHeight ?? 0}px` : '0px');
  }, [collapsed, hasChildren, isOpen, item.children?.length]);

  const triggerClassName = useMemo(
    () =>
      cn(
        'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center' : 'gap-3',
        active || activeChild
          ? 'bg-white text-[#1B1D21]'
          : 'text-white/85 hover:bg-white/10 hover:text-white'
      ),
    [active, activeChild, collapsed]
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
        {!collapsed && <span>{item.label}</span>}
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
        <div className={cn('flex items-center', !collapsed && 'gap-3')}>
          {Icon ? <Icon size={18} className="shrink-0" /> : null}
          {!collapsed && <span>{item.label}</span>}
        </div>
        {!collapsed && (
          <ChevronDown
            size={16}
            className={cn('ml-auto shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
          />
        )}
      </button>

      <div
        className={cn('overflow-hidden transition-all duration-300 ease-in-out', collapsed && 'hidden')}
        style={{ maxHeight, opacity: isOpen ? 1 : 0 }}
      >
        <div ref={contentRef} className="ml-9 flex flex-col gap-1 pb-1">
          {item.children?.map((child) => {
            const childActive = matchesPath(currentPath, child.path);
            return (
              <Link
                key={child.id}
                to={child.path || '#'}
                onClick={onNavigate}
                className={cn(
                  'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  childActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
