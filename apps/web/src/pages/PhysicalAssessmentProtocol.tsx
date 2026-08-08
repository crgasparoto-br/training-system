import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { canAccessBlock } from '../access/access-control';
import { assessmentHistorySections } from '../data/assessmentVariables';
import { useAuthStore } from '../stores/useAuthStore';
import { AdipometryScreen } from './PhysicalAssessment/AdipometryScreen';
import { AnthropometryScreen } from './PhysicalAssessment/AnthropometryScreen';
import { CapacityPrescriptionScreen } from './PhysicalAssessment/CapacityPrescriptionScreen';
import { ProntuarioInitialAnamnesisCard } from './PhysicalAssessment/ProntuarioInitialAnamnesisCard';
import { ProntuarioScreenWithDiscomfortFollowUps } from './PhysicalAssessment/ProntuarioScreenWithDiscomfortFollowUps';
import { ProtocolNavTabs, buildProtocolPath } from './PhysicalAssessment/protocolNav';

type ProtocolPageConfig = {
  slug: string;
  title: string;
  description: string;
  objective: string;
  highlights: string[];
  sectionTitles: string[];
};

const protocolPages: ProtocolPageConfig[] = [
  {
    slug: 'antropometria',
    title: 'Antropometria',
    description: 'Tela do professor para registrar medidas lineares, perímetros e segmentos da avaliação antropométrica.',
    objective: 'Consolidar a coleta antropométrica do aluno com histórico, comparação e apoio técnico por medida.',
    highlights: [
      'Cada avaliação recebe código ANTR automático e preserva o histórico anterior.',
      'Segmentos são configuráveis e não recebem código ANTR.',
      'A comparação lado a lado ajuda o professor a enxergar evolução e variações.',
    ],
    sectionTitles: ['Dados Antropométricos', 'Relação Abdome-Quadril'],
  },
  {
    slug: 'prontuario-entrevista-acompanhamento',
    title: 'Prontuário de entrevista e acompanhamento',
    description: 'Centralize o contexto clínico, comportamental e operacional que sustenta a leitura da avaliação física.',
    objective: 'Registrar informações que expliquem o momento do aluno, apoiem condutas e mantenham rastreabilidade no acompanhamento.',
    highlights: [
      'Documentar objetivo principal, histórico de treino, lesões, medicações e observações relevantes.',
      'Atualizar mudanças de rotina, adesão, sintomas, dores e eventos entre reavaliações.',
      'Manter linguagem objetiva para que outro profissional consiga entender rapidamente o caso.',
    ],
    sectionTitles: [],
  },
  {
    slug: 'prescricao-capacidades',
    title: 'Prescrição por capacidades',
    description: 'Planeje resistido, cíclico, flexibilidade e equilíbrio antes da Montagem Consolidada.',
    objective: 'Relacionar objetivos, avaliações, alertas e ciclos de planejamento a versões técnicas validadas pelo professor.',
    highlights: [
      'Separar visão técnica do professor e mensagem prática do aluno.',
      'Organizar macrociclo, mesociclo, microciclo e os parâmetros definidos para o planejamento.',
      'Preservar a decisão final do professor sem publicar Treino de hoje diretamente.',
    ],
    sectionTitles: [],
  },
  {
    slug: 'adipometria',
    title: 'Adipometria',
    description: 'Estruture a coleta e leitura das dobras cutâneas para estimativa de composição corporal.',
    objective: 'Transformar medidas de dobras em indicadores comparáveis ao longo do tempo.',
    highlights: [
      'Respeitar o protocolo de pinçamento, lateralidade e ordem das dobras.',
      'Conferir soma de dobras, percentual de gordura e massa magra no mesmo fechamento.',
      'Registrar qualquer condição que possa interferir na comparação entre avaliações.',
    ],
    sectionTitles: ['Dobras Cutâneas / Composição Corporal'],
  },
  {
    slug: 'bioimpedanciometria',
    title: 'Bioimpedanciometria',
    description: 'Organize a análise segmentada da composição corporal a partir dos dados gerados pela bioimpedância.',
    objective: 'Comparar massa muscular, gordura e distribuição segmentar com o contexto do aluno.',
    highlights: [
      'Padronizar hidratação, horário e condições pré-teste para reduzir viés de leitura.',
      'Avaliar massa muscular segmentada e gordura segmentada em conjunto.',
      'Conectar o resultado com assimetrias, planejamento e checkpoints de reavaliação.',
    ],
    sectionTitles: ['Composição Corporal Segmentada'],
  },
  {
    slug: 'ultrassonografia',
    title: 'Ultrassonografia',
    description: 'Estruture a leitura por imagem de espessura muscular e tecido adiposo dentro do protocolo.',
    objective: 'Monitorar alterações estruturais com precisão local, apoiando decisões de treino.',
    highlights: [
      'Padronizar ponto anatômico, posicionamento e pressão do transdutor.',
      'Separar espessura de tecido muscular e espessura de tecido adiposo.',
      'Usar a ultrassonografia como complemento de alta precisão ao histórico global do aluno.',
    ],
    sectionTitles: ['Ultrassom'],
  },
];

function getProtocolFromPath(pathname: string) {
  return protocolPages.find((page) => pathname.endsWith(`/${page.slug}`)) ?? protocolPages[0];
}

function GenericProtocolScreen({ currentProtocol, alunoId }: { currentProtocol: ProtocolPageConfig; alunoId: string }) {
  const relatedSections = assessmentHistorySections.filter((section) =>
    currentProtocol.sectionTitles.includes(section.title)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Protocolo de Avaliação Física</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{currentProtocol.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{currentProtocol.description}</p>
        </div>
        <ProtocolNavTabs activeSlug={currentProtocol.slug} alunoId={alunoId} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Objetivo do protocolo</CardTitle>
            <CardDescription>Diretriz operacional da seção atual para orientar coleta, registro e leitura técnica.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-foreground">{currentProtocol.objective}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {currentProtocol.highlights.map((highlight) => (
                <div key={highlight} className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-foreground">
                  {highlight}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Submenus</CardTitle>
            <CardDescription>Navegue rapidamente entre os blocos do protocolo físico.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {protocolPages.map((page) => {
              const active = page.slug === currentProtocol.slug;
              return (
                <Link
                  key={page.slug}
                  to={buildProtocolPath(page.slug, alunoId)}
                  className={active ? 'block rounded-lg border border-primary bg-primary/10 px-4 py-3 text-sm text-primary' : 'block rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground hover:bg-muted'}
                >
                  <span className="block font-semibold">{page.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{page.description}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {relatedSections.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Variáveis e blocos relacionados</CardTitle>
            <CardDescription>Consulte as medidas e os indicadores utilizados neste protocolo.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              {relatedSections.map((section) => (
                <div key={`${section.title}-${section.subtitle ?? 'base'}`} className="rounded-lg border border-border bg-muted/30 p-5">
                  <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                  {section.subtitle ? <p className="text-sm text-muted-foreground">{section.subtitle}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {section.variables.map((variable) => (
                      <span key={variable} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function PhysicalAssessmentProtocol() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const currentProtocol = getProtocolFromPath(location.pathname);
  const alunoId = searchParams.get('alunoId') || '';

  if (currentProtocol.slug === 'antropometria') return <AnthropometryScreen />;
  if (currentProtocol.slug === 'adipometria') return <AdipometryScreen />;
  if (currentProtocol.slug === 'prontuario-entrevista-acompanhamento') {
    return (
      <div className="space-y-6">
        {alunoId ? <ProntuarioInitialAnamnesisCard alunoId={alunoId} /> : null}
        <ProntuarioScreenWithDiscomfortFollowUps />
      </div>
    );
  }

  if (currentProtocol.slug === 'prescricao-capacidades') {
    const canViewAssessmentSources = canAccessBlock(user, 'students.details.assessments');
    return (
      <div className="space-y-4">
        {!canViewAssessmentSources ? (
          <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Seu perfil pode acessar a prescrição, mas não possui permissão para consultar avaliações físicas. As fontes de avaliação não serão exibidas; objetivos, alertas permitidos e notas técnicas continuam disponíveis.
          </div>
        ) : null}
        <CapacityPrescriptionScreen />
      </div>
    );
  }

  return <GenericProtocolScreen currentProtocol={currentProtocol} alunoId={alunoId} />;
}
