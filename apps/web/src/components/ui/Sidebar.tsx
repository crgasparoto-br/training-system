import * as React from 'react';
import { cn } from '@/utils/cn';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  collapsible?: boolean;
  collapsed?: boolean;
  mobileOpen?: boolean;
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, collapsible = false, collapsed = false, mobileOpen = false, ...props }, ref) => {
    return (
      <aside
        ref={ref}
        data-collapsible={collapsible ? 'true' : 'false'}
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] border-r border-white/10 bg-[#1B1D21] text-white transition-all duration-200 ease-in-out',
          'lg:sticky lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-20' : 'w-64',
          className
        )}
        {...props}
      />
    );
  }
);

Sidebar.displayName = 'Sidebar';

export { Sidebar };
