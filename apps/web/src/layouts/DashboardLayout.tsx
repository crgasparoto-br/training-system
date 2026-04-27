import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, Calendar, FileText, LogOut, Menu, Search, Settings, Users, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { filterSidebarItemsByAccess } from '../access/access-control';
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

  const menuItems = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: 'cadastros',
        icon: Users,
        label: shellCopy.menu.cadastros,
        children: [
          { id: 'alunos', label: shellCopy.menu.cadastroAluno, path: '/alunos', screenKey: 'students.registration' },
          {
            id: 'professores',
            label: shellCopy.menu.cadastroColaborador,
            path: '/professores',
            screenKey: 'collaborators.registration',
          },
          {
            id: 'hourly-rate-levels',
            label: shellCopy.menu.cadastroValoresHoraAula,
            path: '/cadastros/valores-hora-aula',
            screenKey: 'hourlyRateLevels.registration',
          },
        ],
      },
      {
        id: 'physical-assessment-protocol',
        icon: FileText,
        label: 'Protocolo de Avaliação Física',
        path: '/protocolo-avaliacao-fisica',
        screenKey: 'physicalAssessment.protocol',
        children: [
          {
            id: 'physical-assessment-protocol-anthropometry',
            label: 'Antropometria',
            path: '/protocolo-avaliacao-fisica/antropometria',
            screenKey: 'physicalAssessment.protocol',
          },
          {
            id: 'physical-assessment-protocol-interview',
            label: 'Prontuário de entrevista e acompanhamento',
            path: '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento',
            screenKey: 'physicalAssessment.protocol',
          },
          {
            id: 'physical-assessment-protocol-adipometry',
            label: 'Adipometria',
            path: '/protocolo-avaliacao-fisica/adipometria',
            screenKey: 'physicalAssessment.protocol',
          },
          {
            id: 'physical-assessment-protocol-bioimpedance',
            label: 'Bioimpedanciometria',
            path: '/protocolo-avaliacao-fisica/bioimpedanciometria',
            screenKey: 'physicalAssessment.protocol',
          },
          {
            id: 'physical-assessment-protocol-ultrasound',
            label: 'Ultrassonografia',
            path: '/protocolo-avaliacao-fisica/ultrassonografia',
            screenKey: 'physicalAssessment.protocol',
          },
        ],
      },
      {
        id: 'consultas',
        icon: Search,
        label: shellCopy.menu.consultas,
        path: '/consultas',
        children: [
          {
            id: 'consultas-alunos',
            label: shellCopy.menu.consultaAlunos,
            path: '/consultas/alunos',
            screenKey: 'students.consultation',
          },
          {
            id: 'consultas-colaboradores',
            label: shellCopy.menu.consultaColaboradores,
            path: '/consultas/colaboradores',
            screenKey: 'collaborators.consultation',
          },
        ],
      },
      { id: 'plans', icon: Calendar, label: shellCopy.menu.planos, path: '/plans', screenKey: 'plans' },
      { id: 'agenda', icon: Calendar, label: shellCopy.menu.agenda, path: '/agenda', screenKey: 'agenda' },
      { id: 'library', icon: BookOpen, label: shellCopy.menu.biblioteca, path: '/library', screenKey: 'library' },
      { id: 'executions', icon: Activity, label: shellCopy.menu.execucoes, path: '/executions', screenKey: 'executions' },
      { id: 'reports', icon: BarChart3, label: shellCopy.menu.relatorios, path: '/reports', screenKey: 'reports' },
      {
        id: 'settings',
        icon: Settings,
        label: shellCopy.menu.configuracoes,
        path: '/settings',
        screenKey: 'settings.home',
        children: [
          { id: 'settings-contract', label: shellCopy.menu.contrato, path: '/settings/contract', screenKey: 'settings.contract' },
          { id: 'settings-parameters', label: shellCopy.menu.parametros, path: '/settings/parameters', screenKey: 'settings.parameters' },
          { id: 'settings-assessment-types', label: shellCopy.menu.avaliacoes, path: '/settings/assessment-types', screenKey: 'settings.assessmentTypes' },
          { id: 'settings-services', label: shellCopy.menu.servicos, path: '/settings/services', screenKey: 'settings.services' },
          { id: 'settings-banks', label: shellCopy.menu.bancos, path: '/settings/banks', screenKey: 'settings.banks' },
          {
            id: 'settings-collaborator-functions',
            label: shellCopy.menu.funcoesColaboradores,
            path: '/settings/collaborator-functions',
            screenKey: 'settings.collaboratorFunctions',
          },
          { id: 'settings-psr-pse', label: 'PSR e PSE', path: '/settings/psr-pse', screenKey: 'settings.subjectiveScales' },
          {
            id: 'settings-professor-manual',
            label: shellCopy.menu.manualProfessor,
            path: '/settings/professor-manual',
            screenKey: 'settings.professorManual',
          },
          { id: 'settings-reference-table', label: shellCopy.menu.tabelaReferencia, path: '/settings/reference-table', screenKey: 'settings.referenceTable' },
          { id: 'settings-aluno-access', label: shellCopy.menu.cadastroAlunos, path: '/settings/aluno-access', screenKey: 'settings.alunoAccess' },
        ],
      },
    ],
    []
  );

  const visibleMenuItems = useMemo(
    () => filterSidebarItemsByAccess(menuItems, user),
    [menuItems, user]
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
                    : user.professor?.collaboratorFunction?.name || 'Professor'
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
          items={visibleMenuItems}
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
