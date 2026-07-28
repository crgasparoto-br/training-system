import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, User, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { filterSidebarItemsByAccess } from '../access/access-control';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { AppSidebar, type SidebarNavItem } from '../components/sidebar';
import { sidebarMenuItems } from '../navigation/sidebarMenu';
import { shellCopy } from '../i18n/ptBR';
import { resolveAssetUrl } from '../utils/assetUrl';
import { PRE_REGISTRATION_UI_ENABLED } from '../config/pre-registration-rollout';

const ACCESS_REFRESH_SIGNAL_KEY = 'auth-permissions-updated-at';


function applyExactCapacityPrescriptionAccess(items: SidebarNavItem[]): SidebarNavItem[] {
  return items.map((item) => ({
    ...item,
    ...(item.id === 'physical-assessment-protocol-capacity-prescription'
      ? { screenKey: 'plans.capacityPrescriptions.view' }
      : {}),
    children: item.children
      ? applyExactCapacityPrescriptionAccess(item.children)
      : undefined,
  }));
}

const menuWithPreRegistration = PRE_REGISTRATION_UI_ENABLED
  ? sidebarMenuItems.map((item) => {
      if (item.id !== 'atendimento') return item;

      return {
        ...item,
        children: item.children?.map((group) => {
          if (group.id !== 'atendimento-consultas') return group;
          return {
            ...group,
            children: [
              ...(group.children ?? []),
              {
                id: 'pre-matriculas',
                label: 'Leads e pré-matrículas',
                path: '/pre-matriculas',
                screenKey: 'students.preRegistration',
              },
            ],
          };
        }),
      };
    })
  : sidebarMenuItems;

const appMenuItems = applyExactCapacityPrescriptionAccess(menuWithPreRegistration);

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, loadUser } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const companyDisplayName = user?.professor?.contract?.tradeName?.trim()
    || user?.professor?.contract?.name?.trim()
    || shellCopy.productName;

  const companyLogoUrl = resolveAssetUrl(user?.professor?.contract?.logoUrl);
  const userAvatarUrl = resolveAssetUrl((user as { profile?: { avatar?: string | null } } | null)?.profile?.avatar);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    const refreshUser = () => {
      void loadUser();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACCESS_REFRESH_SIGNAL_KEY) {
        refreshUser();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshUser();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshUser);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshUser);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadUser]);

  useEffect(() => {
    document.title = companyDisplayName;

    return () => {
      document.title = shellCopy.productName;
    };
  }, [companyDisplayName]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const visibleMenuItems = useMemo(
    () => filterSidebarItemsByAccess(appMenuItems, user),
    [user]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="ts-container flex h-16 min-w-0 max-w-full items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="shrink-0 rounded-md p-1 text-foreground lg:hidden"
              aria-label="Abrir menu lateral"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={companyDisplayName}
                  className="h-10 w-auto max-w-[120px] shrink-0 rounded-md border border-border bg-white p-1.5 object-contain"
                />
              ) : null}
              <h1 className="min-w-0 truncate text-sm font-semibold sm:text-lg">
                {companyDisplayName}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            <div className="hidden flex-col items-end md:flex">
              <span className="text-sm font-semibold text-foreground">{user?.name}</span>
              <span className="text-xs text-muted-foreground">
                {user?.type === 'professor'
                  ? user.professor?.role === 'master'
                    ? 'Professor Master'
                    : user.professor?.collaboratorFunction?.name || 'Professor'
                  : 'Aluno'}
              </span>
            </div>
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground sm:flex">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt={user?.name || 'Usuário'} className="h-full w-full object-cover" />
              ) : (
                <User size={18} aria-hidden="true" />
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Sair"
            >
              <LogOut size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className="ts-container flex max-w-full">
        <AppSidebar
          items={visibleMenuItems}
          currentPath={location.pathname}
          collapsed={isSidebarCollapsed}
          mobileOpen={isSidebarOpen}
          onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
          onNavigate={() => setIsSidebarOpen(false)}
        />

        <main className={cn('min-w-0 flex-1 py-6 transition-all duration-200', isSidebarCollapsed ? 'lg:pl-4' : 'lg:pl-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
