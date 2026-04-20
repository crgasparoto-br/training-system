import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, Calendar, Home, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { AppSidebar, type SidebarNavItem } from '../components/sidebar';
import { cn } from '@/utils/cn';
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

  const canAccessAlunoSettings = user?.type === 'professor' && user?.professor?.role === 'master';

  const menuItems = useMemo<SidebarNavItem[]>(
    () => [
      { id: 'dashboard', icon: Home, label: shellCopy.menu.dashboard, path: '/dashboard' },
      ...(canManageProfessores ? [{ id: 'professores', icon: Users, label: shellCopy.menu.professores, path: '/professores' }] : []),
      { id: 'alunos', icon: Users, label: shellCopy.menu.alunos, path: '/alunos' },
      { id: 'plans', icon: Calendar, label: shellCopy.menu.planos, path: '/plans' },
      { id: 'agenda', icon: Calendar, label: shellCopy.menu.agenda, path: '/agenda' },
      { id: 'library', icon: BookOpen, label: shellCopy.menu.biblioteca, path: '/library' },
      { id: 'executions', icon: Activity, label: shellCopy.menu.execucoes, path: '/executions' },
      { id: 'reports', icon: BarChart3, label: shellCopy.menu.relatorios, path: '/reports' },
      {
        id: 'settings',
        icon: Settings,
        label: shellCopy.menu.configuracoes,
        path: '/settings',
        children: [
          { id: 'settings-contract', label: shellCopy.menu.contrato, path: '/settings/contract' },
          { id: 'settings-parameters', label: shellCopy.menu.parametros, path: '/settings/parameters' },
          { id: 'settings-assessment-types', label: shellCopy.menu.avaliacoes, path: '/settings/assessment-types' },
          { id: 'settings-psr-pse', label: 'PSR e PSE', path: '/settings/psr-pse' },
          { id: 'settings-reference-table', label: shellCopy.menu.tabelaReferencia, path: '/settings/reference-table' },
          ...(canAccessAlunoSettings
            ? [{ id: 'settings-aluno-access', label: shellCopy.menu.cadastroAlunos, path: '/settings/aluno-access' }]
            : []),
        ],
      },
    ],
    [canAccessAlunoSettings, canManageProfessores]
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
            <h1 className="text-xl font-bold">{shellCopy.productName}</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden flex-col items-end md:flex">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs text-muted-foreground">
                {user?.type === 'professor'
                  ? user.professor?.role === 'master'
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

