import type { LucideIcon } from 'lucide-react';
import type { AccessScreenKey } from '@corrida/types';

export interface SidebarNavItem {
  id: string;
  label: string;
  description?: string;
  path?: string;
  screenKey?: AccessScreenKey | string;
  icon?: LucideIcon;
  children?: SidebarNavItem[];
}
