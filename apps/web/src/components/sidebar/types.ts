import type { LucideIcon } from 'lucide-react';

export interface SidebarNavItem {
  id: string;
  label: string;
  path?: string;
  icon?: LucideIcon;
  children?: SidebarNavItem[];
}
