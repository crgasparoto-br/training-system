import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Briefcase, FileText, LogOut, Menu, Search, Settings, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { filterSidebarItemsByAccess } from '../access/access-control';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { AppSidebar, type SidebarNavItem } from '../components/sidebar';
import { shellCopy } from '../i18n/ptBR';

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, loadUser } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const companyDisplayName = user?.professor?.contract?.tradeName?.trim()
    || user?.professor?.contract?.name?.trim()
    || shellCopy.productName;

  const companyLogoUrl = user?.professor?.contract?.logoUrl?.trim()
    ? user.professor.contract.logoUrl.startsWith('http://') || user.professor.contract.logoUrl.startsWith('https://')
      ? user.professor.contract.logoUrl
      : user.professor.contract.logoUrl.startsWith('/')
        ? user.professor.contract.logoUrl
        : `/${user.professor.contract.logoUrl}`
    : null;

  useEffect(() => {
    void loadUser();
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

  const menuItems = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: 'atendimento',
        icon: Search,
        label: 'Atendimento',
        description: 'Alunos e colaboradores',
        children: [
          {
            id: 'atendimento-alunos',
            label: 'Alunos',
            children: [
              { id: 'consultas-alunos', label: 'Consultar alunos', path: '/consultas/alunos', screenKey: 'students.consultation' },
              { id: 'alunos', label: 'Novo aluno', path: '/alunos', screenKey: 'students.registration' },
              { id: 'settings-aluno-access', label: 'Acesso dos alunos', path: '/settings/aluno-access', screenKey: 'settings.alunoAccess' },
            ],
          },
          {
            id: 'atendimento-colaboradores',
            label: 'Colaboradores',
            children: [
              { id: 'consultas-colaboradores', label: 'Consultar colaboradores', path: '/consultas/colaboradores', screenKey: 'collaborators.consultation' },
              { id: 'professores', label: 'Novo colaborador', path: '/professores', screenKey: 'collaborators.registration' },
            ],
          },
        ],
      },
      {
        id: 'treinamento',
        icon: Activity,
        label: 'Treinamento',
        description: 'Planejamento e execução',
        children: [
          { id: 'plans', label: 'Planos de treino', path: '/plans', screenKey: 'plans' },
          { id: 'agenda', label: 'Agenda', path: '/agenda', screenKey: 'agenda' },
          { id: 'library', label: 'Biblioteca de exercícios', path: '/library', screenKey: 'library' },
          { id: 'executions', label: 'Execuções dos alunos', path: '/executions', screenKey: 'executions' },
        ],
      },
      {
        id: 'gestao',
        icon: Briefcase,
        label: 'Gestão',
        description: 'Comercial e documentos',
        children: [
          {
            id: 'gestao-contratos',
            label: 'Contratos',
            children: [
              { id: 'settings-contract-templates', label: 'Modelos de contrato', path: '/settings/contract-templates', screenKey: 'settings.contract' },
              { id: 'settings-contract', label: 'Empresa / prestador', path: '/settings/contract', screenKey: 'settings.contract' },
            ],
          },
          {
            id: 'gestao-comercial',
            label: 'Comercial',
            children: [
              { id: 'settings-services', label: 'Serviços e planos', path: '/settings/services', screenKey: 'settings.services' },
              { id: 'hourly-rate-levels', label: 'Valores de hora/aula', path: '/cadastros/valores-hora-aula', screenKey: 'hourlyRateLevels.registration' },
            ],
          },
          {
            id: 'gestao-administrativo',
            label: 'Administrativo',
            children: [
              { id: 'settings-banks', label: 'Bancos', path: '/settings/banks', screenKey: 'settings.banks' },
              { id: 'settings-collaborator-functions', label: 'Funções de colaboradores', path: '/settings/collaborator-functions', screenKey: 'settings.collaboratorFunctions' },
            ],
          },
        ],
      },
      {
        id: 'physical-assessment-protocol',
        icon: FileText,
        label: 'Avaliação física',
        description: 'Protocolos e medidas',
        screenKey: 'physicalAssessment.protocol',
        children: [
          { id: 'physical-assessment-protocol-anthropometry', label: 'Antropometria', path: '/protocolo-avaliacao-fisica/antropometria', screenKey: 'physicalAssessment.protocol' },
          { id: 'physical-assessment-protocol-interview', label: 'Prontuário e acompanhamento', path: '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento', screenKey: 'physicalAssessment.protocol' },
          { id: 'physical-assessment-protocol-adipometry', label: 'Adipometria', path: '/protocolo-avaliacao-fisica/adipometria', screenKey: 'physicalAssessment.protocol' },
          { id: 'physical-assessment-protocol-bioimpedance', label: 'Bioimpedanciometria', path: '/protocolo-avaliacao-fisica/bioimpedanciometria', screenKey: 'physicalAssessment.protocol' },
          { id: 'physical-assessment-protocol-ultrasound', label: 'Ultrassonografia', path: '/protocolo-avaliacao-fisica/ultrassonografia', screenKey: 'physicalAssessment.protocol' },
        ],
      },
      { id: 'reports', icon: BarChart3, label: 'Relatórios', path: '/reports', screenKey: 'reports' },
      {
        id: 'settings',
        icon: Settings,
        label: 'Configurações',
        description: 'Parâmetros do sistema',
        path: '/settings',
        screenKey: 'settings.home',
        children: [
          {
            id: 'settings-system',
            label: 'Sistema',
            children: [
              { id: 'settings-parameters', label: 'Parâmetros de treino', path: '/settings/parameters', screenKey: 'settings.parameters' },
              { id: 'settings-psr-pse', label: 'Escalas PSR e PSE', path: '/settings/psr-pse', screenKey: 'settings.subjectiveScales' },
              { id: 'settings-professor-manual', label: 'Manual do professor', path: '/settings/professor-manual', screenKey: 'settings.professorManual' },
              { id: 'settings-reference-table', label: 'Tabela de referência', path: '/settings/reference-table', screenKey: 'settings.referenceTable' },
            ],
          },
          {
            id: 'settings-assessments',
            label: 'Avaliações',
            children: [
              { id: 'settings-assessment-types', label: 'Tipos de avaliação', path: '/settings/assessment-types', screenKey: 'settings.assessmentTypes' },
            ],
          },
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
            <div className="flex items-center gap-3 min-w-0">
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={companyDisplayName}
                  className="h-10 w-auto max-w-[120px] rounded-md border border-border bg-white p-1.5 object-contain"
                />
              ) : null}
              <h1 className="truncate text-lg font-semibold">{companyDisplayName}</h1>
            </div>
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
