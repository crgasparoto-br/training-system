import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, Calendar, Home, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { AppSidebar, type SidebarNavItem } from '../components/sidebar';
import { cn } from '@/utils/cn';

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

  const canManageEducators =
    user?.type === 'educator' &&
    user?.educator?.role === 'master' &&
    user?.educator?.contract?.type === 'academy';

  const canAccessAthleteSettings = user?.type === 'educator' && user?.educator?.role === 'master';

  const menuItems = useMemo<SidebarNavItem[]>(
    () => [
      { id: 'dashboard', icon: Home, label: 'Dashboard', path: '/dashboard' },
      ...(canManageEducators ? [{ id: 'educators', icon: Users, label: 'Professores', path: '/educators' }] : []),
      { id: 'athletes', icon: Users, label: 'Alunos', path: '/athletes' },
      { id: 'plans', icon: Calendar, label: 'Planos de Treino', path: '/plans' },
      { id: 'agenda', icon: Calendar, label: 'Agenda', path: '/agenda' },
      { id: 'library', icon: BookOpen, label: 'Biblioteca', path: '/library' },
      { id: 'executions', icon: Activity, label: 'Execucoes', path: '/executions' },
      { id: 'reports', icon: BarChart3, label: 'Relatorios', path: '/reports' },
      {
        id: 'settings',
        icon: Settings,
        label: 'Configuracoes',
        path: '/settings',
        children: [
          { id: 'settings-contract', label: 'Contrato', path: '/settings/contract' },
          { id: 'settings-parameters', label: 'Parametros', path: '/settings/parameters' },
          { id: 'settings-assessment-types', label: 'Avaliacoes', path: '/settings/assessment-types' },
          { id: 'settings-psr-pse', label: 'PSR e PSE', path: '/settings/psr-pse' },
          { id: 'settings-reference-table', label: 'Tabela de Referencia', path: '/settings/reference-table' },
          ...(canAccessAthleteSettings
            ? [{ id: 'settings-athlete-access', label: 'Cadastro de Alunos', path: '/settings/athlete-access' }]
            : []),
        ],
      },
    ],
    [canAccessAthleteSettings, canManageEducators]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-full items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="lg:hidden"
              aria-label="Abrir menu lateral"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="text-xl font-bold">Training System</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden flex-col items-end md:flex">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs text-muted-foreground">
                {user?.type === 'educator'
                  ? user.educator?.role === 'master'
                    ? 'Professor Master'
                    : 'Professor'
                  : 'Aluno'}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut size={20} />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-full px-4">
        <AppSidebar
          items={menuItems}
          currentPath={location.pathname}
          collapsed={isSidebarCollapsed}
          mobileOpen={isSidebarOpen}
          onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
          onNavigate={() => setIsSidebarOpen(false)}
        />

        {isSidebarOpen && (
          <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        <main className={cn('flex-1 py-6 transition-all duration-200', isSidebarCollapsed ? 'lg:pl-4' : 'lg:pl-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
