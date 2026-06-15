import type { AuthResponse } from '@corrida/types';
import { Link } from 'react-router-dom';
import { canAccessScreen } from '../access/access-control';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useAuthStore } from '../stores/useAuthStore';

type CurrentUser = AuthResponse['user'] | null | undefined;

type HomeShortcut = {
  title: string;
  description: string;
  path: string;
  screenKey: string;
  group: 'professor' | 'administrative' | 'manager' | 'settings';
};

const shortcuts: HomeShortcut[] = [
  {
    title: 'Consultar alunos',
    description: 'Abra a lista de alunos para acompanhar cadastro, contexto e Aluno 360.',
    path: '/consultas/alunos',
    screenKey: 'students.consultation',
    group: 'professor',
  },
  {
    title: 'Novo aluno',
    description: 'Cadastre um aluno e mantenha dados iniciais separados de prontuario e avaliacao.',
    path: '/alunos/new',
    screenKey: 'students.registration',
    group: 'administrative',
  },
  {
    title: 'Agenda do dia',
    description: 'Consulte sessoes, compromissos e proximas rotinas operacionais.',
    path: '/agenda',
    screenKey: 'agenda',
    group: 'professor',
  },
  {
    title: 'Planos de treino',
    description: 'Acompanhe planejamento, templates e ajustes permitidos de treino.',
    path: '/plans',
    screenKey: 'plans',
    group: 'professor',
  },
  {
    title: 'Execucoes dos alunos',
    description: 'Revise execucoes registradas e evidencias operacionais de treino.',
    path: '/executions',
    screenKey: 'executions',
    group: 'professor',
  },
  {
    title: 'Avaliacoes fisicas',
    description: 'Acesse protocolos, medidas e prontuario conforme permissao tecnica.',
    path: '/protocolo-avaliacao-fisica/antropometria',
    screenKey: 'physicalAssessment.protocol',
    group: 'professor',
  },
  {
    title: 'Colaboradores',
    description: 'Consulte a equipe vinculada ao contrato e respeite o escopo permitido.',
    path: '/consultas/colaboradores',
    screenKey: 'collaborators.consultation',
    group: 'manager',
  },
  {
    title: 'Novo colaborador',
    description: 'Cadastre um colaborador e organize sua funcao operacional.',
    path: '/professores/new',
    screenKey: 'collaborators.registration',
    group: 'manager',
  },
  {
    title: 'Servicos e planos',
    description: 'Revise os servicos comerciais usados no cadastro e nos contratos.',
    path: '/settings/services',
    screenKey: 'settings.services',
    group: 'manager',
  },
  {
    title: 'Relatorios',
    description: 'Acesse a area de indicadores quando ela estiver liberada para o perfil.',
    path: '/reports',
    screenKey: 'reports',
    group: 'manager',
  },
  {
    title: 'Acesso dos alunos',
    description: 'Gerencie acesso do aluno ao app quando a rotina estiver liberada.',
    path: '/settings/aluno-access',
    screenKey: 'settings.alunoAccess',
    group: 'settings',
  },
  {
    title: 'Configuracoes',
    description: 'Acesse parametros, modelos e cadastros de suporte do sistema.',
    path: '/settings',
    screenKey: 'settings.home',
    group: 'settings',
  },
];

const groupLabels: Record<HomeShortcut['group'], { title: string; description: string }> = {
  professor: {
    title: 'Rotina do professor',
    description: 'Atalhos para atendimento, agenda, treino e avaliacao tecnica.',
  },
  administrative: {
    title: 'Rotina administrativa',
    description: 'Cadastros, revisoes e entradas operacionais sem expor dados tecnicos desnecessarios.',
  },
  manager: {
    title: 'Gestao',
    description: 'Equipe, comercial, indicadores e operacao com escopo permitido.',
  },
  settings: {
    title: 'Configuracoes e acessos',
    description: 'Parametros e cadastros de suporte para perfis autorizados.',
  },
};

function getRoleLabel(user: CurrentUser) {
  if (user?.type !== 'professor') {
    return 'Aluno';
  }

  if (user.professor?.role === 'master') {
    return 'Master';
  }

  return user.professor?.collaboratorFunction?.name || 'Professor';
}

export function Home() {
  const { user } = useAuthStore();
  const visibleShortcuts = shortcuts.filter((shortcut) => canAccessScreen(user, shortcut.screenKey));
  const visibleGroups = (Object.keys(groupLabels) as HomeShortcut['group'][])
    .map((group) => ({
      group,
      ...groupLabels[group],
      shortcuts: visibleShortcuts.filter((shortcut) => shortcut.group === group),
    }))
    .filter((group) => group.shortcuts.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{getRoleLabel(user)}</p>
        <h1 className="text-2xl font-bold text-foreground">Inicio</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Comece pelas rotinas liberadas para o seu perfil. Os atalhos abaixo usam as mesmas permissoes das telas de destino e nao exibem dados sensiveis agregados.
        </p>
      </div>

      {visibleGroups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma rotina liberada</CardTitle>
            <CardDescription>
              Seu perfil ainda nao possui atalhos de rotina disponiveis. Solicite a revisao das permissoes da sua funcao.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        visibleGroups.map((group) => (
          <section key={group.group} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{group.title}</h2>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.shortcuts.map((shortcut) => (
                <Link
                  key={shortcut.path}
                  to={shortcut.path}
                  className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-soft)] transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex h-full flex-col justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{shortcut.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{shortcut.description}</p>
                    </div>
                    <span className="text-sm font-medium text-primary">Acessar</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle>Proximas evolucoes</CardTitle>
          <CardDescription>
            Esta primeira versao usa atalhos seguros por permissao. Indicadores, pendencias calculadas e alertas agregados devem entrar somente quando a origem dos dados e o bloqueio de acesso estiverem validados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Professor: agenda do dia, alunos proximos e treinos a revisar.
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Administrativo: cadastros, contratos, cobrancas e revisoes cadastrais.
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Gestor: equipe, ocupacao, financeiro permitido e indicadores confiaveis.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
