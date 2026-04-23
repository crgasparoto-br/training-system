import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Users, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { AppSidebar, type SidebarNavItem } from '../components/sidebar';
import { shellCopy } from '../i18n/ptBR';

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const canManageProfessores =
    user?.type === 'professor' &&
    user?.professor?.role === 'master' &&
    user?.professor?.contract?.type === 'academy';

  const menuItems = useMemo<SidebarNavItem[]>(
    () => [
      ...(canManageProfessores ? [{ id: 'professores', icon: Users, label: shellCopy.menu.professores, path: '/professores' }] : []),
      { id: 'alunos', icon: Users, label: shellCopy.menu.alunos, path: '/alunos' },
    ],
    [canManageProfessores]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="ts-container flex h-16 max-w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="rounded-md p-1 text-foreground lg:hidden"
              aria-label="Abrir menu lateral"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="text-lg font-semibold">{shellCopy.productName}</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden flex-col items-end md:flex">
              <span className="text-sm font-semibold text-foreground">{user?.name}</span>
              <span className="text-xs text-muted-foreground">
                {user?.type === 'professor'
                  ? user.professor?.role === 'master'
                    ? 'Professor Master'
                    : 'Professor'
                  : 'Aluno'}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </header>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className="ts-container flex max-w-full">
        <AppSidebar
          items={menuItems}
          currentPath={location.pathname}
          collapsed={isSidebarCollapsed}
          mobileOpen={isSidebarOpen}
          onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
          onNavigate={() => setIsSidebarOpen(false)}
        />

        <main className={cn('flex-1 py-6 transition-all duration-200', isSidebarCollapsed ? 'lg:pl-4' : 'lg:pl-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
