import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { assessmentHistorySections } from '../data/assessmentVariables';
import { AnthropometryScreen } from './PhysicalAssessment/AnthropometryScreen';

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

function GenericProtocolScreen({ currentProtocol }: { currentProtocol: ProtocolPageConfig }) {
  const relatedSections = assessmentHistorySections.filter((section) =>
    currentProtocol.sectionTitles.includes(section.title)
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Protocolo de Avaliação Física</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{currentProtocol.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{currentProtocol.description}</p>
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
                  to={`/protocolo-avaliacao-fisica/${page.slug}`}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Variáveis e blocos relacionados</CardTitle>
          <CardDescription>Referência rápida das seções já mapeadas no sistema e conectadas a este submenu.</CardDescription>
        </CardHeader>
        <CardContent>
          {relatedSections.length > 0 ? (
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
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm leading-6 text-muted-foreground">
              Este submenu já está preparado no menu lateral e pronto para receber sua tela dedicada.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PhysicalAssessmentProtocol() {
  const location = useLocation();
  const currentProtocol = getProtocolFromPath(location.pathname);

  if (currentProtocol.slug === 'antropometria') {
    return <AnthropometryScreen />;
  }

  return <GenericProtocolScreen currentProtocol={currentProtocol} />;
}
