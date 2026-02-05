import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import {
  Home,
  Users,
  Calendar,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
  BookOpen,
} from 'lucide-react';

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const canManageEducators =
    user?.type === 'educator' &&
    user?.educator?.role === 'master' &&
    user?.educator?.contract?.type === 'academy';

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    ...(canManageEducators ? [{ icon: Users, label: 'Educadores', path: '/educators' }] : []),
    { icon: Users, label: 'Atletas', path: '/athletes' },
    { icon: Calendar, label: 'Planos de Treino', path: '/plans' },
    { icon: BookOpen, label: 'Biblioteca', path: '/library' },
    { icon: Activity, label: 'Execuções', path: '/executions' },
    { icon: BarChart3, label: 'Relatórios', path: '/reports' },
    { icon: Settings, label: 'Configurações', path: '/settings' },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 max-w-full mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="text-xl font-bold">Corrida Training</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs text-muted-foreground">
                {user?.type === 'educator'
                  ? user.educator?.role === 'master'
                    ? 'Educador Master'
                    : 'Educador'
                  : 'Aluno'}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut size={20} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex px-4 max-w-full mx-auto">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:sticky top-16 left-0 z-30 h-[calc(100vh-4rem)] w-64 border-r bg-background transition-transform duration-200 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <nav className="flex flex-col gap-2 p-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <div key={item.path} className="space-y-1">
                  <Link
                    to={item.path}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                      ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <Icon size={20} />
                    {item.label}
                  </Link>

                  {item.path === '/settings' && (
                    <div className="ml-9 flex flex-col gap-1">
                      <Link
                        to="/settings/contract"
                        onClick={() => setIsSidebarOpen(false)}
                        className={`
                          rounded-md px-3 py-2 text-xs font-medium transition-colors
                          ${
                            isActive('/settings/contract')
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-600 hover:bg-accent'
                          }
                        `}
                      >
                        Contrato
                      </Link>
                      <Link
                        to="/settings/parameters"
                        onClick={() => setIsSidebarOpen(false)}
                        className={`
                          rounded-md px-3 py-2 text-xs font-medium transition-colors
                          ${
                            isActive('/settings/parameters')
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-600 hover:bg-accent'
                          }
                        `}
                      >
                        Parâmetros
                      </Link>
                      <Link
                        to="/settings/assessment-types"
                        onClick={() => setIsSidebarOpen(false)}
                        className={`
                          rounded-md px-3 py-2 text-xs font-medium transition-colors
                          ${
                            isActive('/settings/assessment-types')
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-600 hover:bg-accent'
                          }
                        `}
                      >
                        Avaliações
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 py-6 lg:pl-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
