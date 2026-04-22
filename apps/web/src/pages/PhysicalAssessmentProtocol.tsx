import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { assessmentHistorySections } from '../data/assessmentVariables';
import { professorService } from '../services/professor.service';
import { useAuthStore } from '../stores/useAuthStore';

type ProtocolPageConfig = {
  slug: string;
  title: string;
  description: string;
  objective: string;
  highlights: string[];
  sectionTitles: string[];
};

type AnthropometryFieldKey =
  | 'evaluationDate'
  | 'professorId'
  | 'observations'
  | 'olecranoAcromioClavicular'
  | 'ligamentoInguinalPatela'
  | 'pescoco'
  | 'busto'
  | 'cintura'
  | 'escapular'
  | 'toracicaInspirada'
  | 'toracicaExpirada'
  | 'bracoDireitoRelaxado'
  | 'bracoDireitoContraido'
  | 'bracoEsquerdoRelaxado'
  | 'bracoEsquerdoContraido'
  | 'antebracoDireito'
  | 'antebracoEsquerdo'
  | 'abdominal'
  | 'quadril'
  | 'cristaIliaca'
  | 'coxaDireita'
  | 'pernaDireita'
  | 'coxaEsquerda'
  | 'pernaEsquerda'
  | 'coxaAltaDireita'
  | 'coxaAltaEsquerda'
  | 'coxaBaixaDireita'
  | 'coxaBaixaEsquerda';

type AnthropometryFormState = Record<AnthropometryFieldKey, string>;

type CustomSegment = {
  id: string;
  name: string;
  value: string;
};

type ProfessorOption = {
  id: string;
  name: string;
};

type AnthropometryHelpItem = {
  id: string;
  title: string;
  description: string;
  videoLabel: string;
  videoUrl: string;
};

const protocolPages: ProtocolPageConfig[] = [
  {
    slug: 'antropometria',
    title: 'Antropometria',
    description: 'Tela do professor para registrar medidas lineares, perímetros e segmentos da avaliação antropométrica.',
    objective: 'Consolidar a coleta antropométrica do aluno com configuração anatômica, observações operacionais e apoio técnico por medida.',
    highlights: [
      'Data da coleta deve vir preenchida com hoje, mas continuar editável manualmente.',
      'Professor responsável fica pré-selecionado, com troca manual pela lista de colaboradores.',
      'As referências anatômicas Antr1 e Antr2 alimentam a leitura de segmentos como a coxa.',
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
    description: 'Estruture a coleta e leitura das dobras cutâneas para estimativa de composição corporal e evolução do tecido adiposo.',
    objective: 'Transformar medidas de dobras em indicadores comparáveis ao longo do tempo, com coerência técnica e operacional.',
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
    objective: 'Comparar massa muscular, gordura e distribuição segmentar com o contexto do aluno e a estratégia do treino.',
    highlights: [
      'Padronizar hidratação, horário e condições pré-teste para reduzir viés de leitura.',
      'Avaliar massa muscular segmentada e gordura segmentada em conjunto, não de forma isolada.',
      'Conectar o resultado com assimetrias, planejamento e checkpoints de reavaliação.',
    ],
    sectionTitles: ['Composição Corporal Segmentada'],
  },
  {
    slug: 'ultrassonografia',
    title: 'Ultrassonografia',
    description: 'Estruture a leitura por imagem de espessura muscular e tecido adiposo dentro do protocolo de avaliação física.',
    objective: 'Monitorar alterações estruturais com precisão local, apoiando decisões de treino e reavaliação segmentar.',
    highlights: [
      'Padronizar ponto anatômico, posicionamento e pressão do transdutor.',
      'Separar claramente espessura de tecido muscular e espessura de tecido adiposo.',
      'Usar a ultrassonografia como complemento de alta precisão ao histórico global do aluno.',
    ],
    sectionTitles: ['Ultrassom'],
  },
];

const anthropometryHelpItems: AnthropometryHelpItem[] = [
  {
    id: 'olecrano-acromio',
    title: 'Olecrano-Acrômio Clavicular',
    description: 'Distância entre o olécrano e a articulação acrômio clavicular.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/hQr0hDT3-jM?feature=share',
  },
  {
    id: 'ligamento-patela',
    title: 'Ligamento inguinal-borda superior da patela',
    description: 'Distância entre o ligamento inguinal e a borda superior da patela.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/yINLphA-FnY',
  },
  {
    id: 'escapular',
    title: 'Escapular',
    description: 'Maior circunferência envolvendo deltoide, em posição neutra.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/KjTQWVYxnc4',
  },
  {
    id: 'toracica-inspirada',
    title: 'Torácica Inspirada',
    description:
      'Em inspiração máxima, com flexão de ombros. No masculino: linha do mamilo. No feminino: cicatriz axilar.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/-K6J5Xmkaiw',
  },
  {
    id: 'toracica-expirada',
    title: 'Torácica Expirada',
    description:
      'Após expiração total. No masculino: linha do mamilo. No feminino: cicatriz axilar.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/47v1UFsVuwU',
  },
  {
    id: 'braco-direito-relaxado',
    title: 'Braço Direito Relaxado',
    description:
      'Em flexão de ombro e cotovelo a 90°, supinado e com apoio da mão contralateral. Registrar a maior circunferência do braço relaxado.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/SzQGbYR-t-0',
  },
  {
    id: 'braco-direito-contraido',
    title: 'Braço Direito Contraído',
    description:
      'Em flexão de ombro e cotovelo a 90°, supinado e com apoio da mão contralateral. Registrar a maior circunferência do braço em contração isométrica máxima.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/GCAHcLEn4r4',
  },
  {
    id: 'braco-esquerdo-relaxado',
    title: 'Braço Esquerdo Relaxado',
    description:
      'Em flexão de ombro e cotovelo a 90°, supinado e com apoio da mão contralateral. Registrar a maior circunferência do braço relaxado.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/SzQGbYR-t-0',
  },
  {
    id: 'braco-esquerdo-contraido',
    title: 'Braço Esquerdo Contraído',
    description:
      'Em flexão de ombro e cotovelo a 90°, supinado e com apoio da mão contralateral. Registrar a maior circunferência do braço em contração isométrica máxima.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/GCAHcLEn4r4',
  },
  {
    id: 'abdominal',
    title: 'Abdominal',
    description: 'Nível da cicatriz umbilical. Caso a pele esteja caída, usar a região aproximada da cicatriz.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/GNTVWiaohNk',
  },
  {
    id: 'quadril',
    title: 'Quadril',
    description: 'Maior circunferência do glúteo.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/VC6bA3T6uAc',
  },
  {
    id: 'coxa-direita',
    title: 'Coxa Direita',
    description:
      'Linha horizontal a metade da distância entre ligamento inguinal e borda superior da patela.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/2fBpsn0Mrxc',
  },
  {
    id: 'perna-direita',
    title: 'Perna Direita',
    description: 'Maior circunferência da panturrilha.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/uO3aIhS9sJo',
  },
  {
    id: 'coxa-esquerda',
    title: 'Coxa Esquerda',
    description:
      'Linha horizontal a metade da distância entre ligamento inguinal e borda superior da patela.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/2fBpsn0Mrxc',
  },
  {
    id: 'perna-esquerda',
    title: 'Perna Esquerda',
    description: 'Maior circunferência da panturrilha.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/uO3aIhS9sJo',
  },
  {
    id: 'pescoco',
    title: 'Pescoço',
    description: 'Imediatamente abaixo da proeminência laríngea.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/gL6DAAPmmBI',
  },
  {
    id: 'busto',
    title: 'Busto',
    description: 'Circunferência de maior projeção anterior da região torácica.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/mQWFLtR-46w',
  },
  {
    id: 'cintura',
    title: 'Cintura',
    description: 'Imediatamente abaixo da última costela, observada pela linha axilar.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/hB-JPtlwdkU',
  },
  {
    id: 'antebraco-direito',
    title: 'Antebraço Direito',
    description: 'Maior circunferência do antebraço.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/VMbxWWPY0d0',
  },
  {
    id: 'antebraco-esquerdo',
    title: 'Antebraço Esquerdo',
    description: 'Maior circunferência do antebraço.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/VMbxWWPY0d0',
  },
  {
    id: 'crista-iliaca',
    title: 'Crista Ilíaca',
    description: 'Imediatamente acima da borda superior da crista ilíaca.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/7S-MFLxdLq4',
  },
  {
    id: 'coxa-alta-direita',
    title: 'Coxa Alta Direita',
    description: 'Imediatamente abaixo do glúteo.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/oqYNuFG2lj0',
  },
  {
    id: 'coxa-alta-esquerda',
    title: 'Coxa Alta Esquerda',
    description: 'Imediatamente abaixo do glúteo.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/oqYNuFG2lj0',
  },
  {
    id: 'coxa-baixa-direita',
    title: 'Coxa Baixa Direita',
    description: 'Imediatamente acima da borda superior da patela.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/XKD-GSrrg4M?feature=share',
  },
  {
    id: 'coxa-baixa-esquerda',
    title: 'Coxa Baixa Esquerda',
    description: 'Imediatamente acima da borda superior da patela.',
    videoLabel: 'Ver tutorial',
    videoUrl: 'https://youtube.com/shorts/XKD-GSrrg4M?feature=share',
  },
];

const initialAnthropometryForm = (): AnthropometryFormState => ({
  evaluationDate: new Date().toISOString().slice(0, 10),
  professorId: '',
  observations: '',
  olecranoAcromioClavicular: '29,8',
  ligamentoInguinalPatela: '37,0',
  pescoco: '',
  busto: '',
  cintura: '',
  escapular: '111,0',
  toracicaInspirada: '95,0',
  toracicaExpirada: '90,0',
  bracoDireitoRelaxado: '33,5',
  bracoDireitoContraido: '35,0',
  bracoEsquerdoRelaxado: '33,5',
  bracoEsquerdoContraido: '35,0',
  antebracoDireito: '',
  antebracoEsquerdo: '',
  abdominal: '84,0',
  quadril: '96,0',
  cristaIliaca: '',
  coxaDireita: '57,5',
  pernaDireita: '35,5',
  coxaEsquerda: '57,5',
  pernaEsquerda: '38,0',
  coxaAltaDireita: '',
  coxaAltaEsquerda: '',
  coxaBaixaDireita: '',
  coxaBaixaEsquerda: '',
});

function getProtocolFromPath(pathname: string) {
  return protocolPages.find((page) => pathname.endsWith(`/${page.slug}`)) ?? protocolPages[0];
}

function parseLocalizedNumber(value: string) {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLocalizedNumber(value: number | null) {
  if (value == null) return 'Não definido';
  return `${value.toFixed(1).replace('.', ',')} cm`;
}

function MeasurementGrid({
  items,
  values,
  onChange,
}: {
  items: Array<{ key: AnthropometryFieldKey; label: string; helper?: string }>;
  values: AnthropometryFormState;
  onChange: (field: AnthropometryFieldKey, value: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.key} className="space-y-2">
          <Input
            label={item.label}
            value={values[item.key]}
            onChange={(event) => onChange(item.key, event.target.value)}
            placeholder="0,0"
          />
          {item.helper ? <p className="text-xs text-muted-foreground">{item.helper}</p> : null}
        </div>
      ))}
    </div>
  );
}

function AnthropometryScreen() {
  const { user } = useAuthStore();
  const [form, setForm] = useState<AnthropometryFormState>(initialAnthropometryForm);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [customSegments, setCustomSegments] = useState<CustomSegment[]>([]);
  const [importObservations, setImportObservations] = useState(true);
  const [importSegments, setImportSegments] = useState(true);

  useEffect(() => {
    let mounted = true;

    const defaultProfessorId = user?.type === 'professor' ? user.professor?.id ?? '' : '';
    if (defaultProfessorId) {
      setForm((current) => (current.professorId ? current : { ...current, professorId: defaultProfessorId }));
    }

    async function loadProfessors() {
      try {
        const response = await professorService.list('active');
        if (!mounted) return;

        const mapped = response.map((professor) => ({
          id: professor.id,
          name: professor.user.profile.name,
        }));

        setProfessors(mapped);
      } catch {
        if (!mounted) return;
        setProfessors([]);
      }
    }

    void loadProfessors();

    return () => {
      mounted = false;
    };
  }, [user]);

  const currentProfessorName =
    user?.type === 'professor' ? user.name : 'Professor responsável';

  const professorOptions = professors.length
    ? professors
    : user?.type === 'professor'
      ? [{ id: user.professor?.id ?? 'current-professor', name: currentProfessorName }]
      : [];

  const ligamentoReference = parseLocalizedNumber(form.ligamentoInguinalPatela);
  const midpointReference = formatLocalizedNumber(ligamentoReference == null ? null : ligamentoReference / 2);
  const relatedSections = assessmentHistorySections.filter((section) =>
    ['Dados Antropométricos', 'Relação Abdome-Quadril'].includes(section.title)
  );

  const handleFieldChange = (field: AnthropometryFieldKey, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleAddSegment = () => {
    setCustomSegments((current) => [
      ...current,
      { id: `segment-${Date.now()}-${current.length}`, name: '', value: '' },
    ]);
  };

  const handleSegmentChange = (id: string, field: 'name' | 'value', value: string) => {
    setCustomSegments((current) =>
      current.map((segment) => (segment.id === id ? { ...segment, [field]: value } : segment))
    );
  };

  const handleRemoveSegment = (id: string) => {
    setCustomSegments((current) => current.filter((segment) => segment.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Protocolo de Avaliação Física</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Antropometria</h1>
        <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
          Primeira construção da tela do professor baseada na aba <strong>Prof-ANTR</strong> da planilha. Esta versão
          já organiza cabeçalho da avaliação, medidas, segmentos e apoio técnico por item.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Nova avaliação de antropometria</CardTitle>
            <CardDescription>
              Data vem pré-configurada com hoje, professor responsável pode ser ajustado e os itens opcionais podem ser
              marcados para importação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Input
                label="Data"
                type="date"
                value={form.evaluationDate}
                onChange={(event) => handleFieldChange('evaluationDate', event.target.value)}
              />

              <div className="w-full">
                <label className="mb-2 block text-sm font-medium text-foreground">Professor</label>
                <select
                  value={form.professorId}
                  onChange={(event) => handleFieldChange('professorId', event.target.value)}
                  className="flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Selecione um colaborador</option>
                  {professorOptions.map((professor) => (
                    <option key={professor.id} value={professor.id}>
                      {professor.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Professor atual sugerido: {currentProfessorName}.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Referência Antr1</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatLocalizedNumber(parseLocalizedNumber(form.olecranoAcromioClavicular))}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Último valor preenchido vira configuração anatômica do bloco superior.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Referência Antr2</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatLocalizedNumber(parseLocalizedNumber(form.ligamentoInguinalPatela))}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Metade da distância usada como apoio visual para leitura de coxa: {midpointReference}.
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Observações</label>
                <textarea
                  value={form.observations}
                  onChange={(event) => handleFieldChange('observations', event.target.value)}
                  placeholder="Ex.: percentual de gordura em 20% ou menos, recuperação pós-cirurgia de quadril..."
                  className="min-h-[132px] w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Itens opcionais a importar</p>
                <div className="mt-4 space-y-3">
                  <label className="flex items-start gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={importObservations}
                      onChange={(event) => setImportObservations(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <span>Importar observações operacionais da avaliação.</span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={importSegments}
                      onChange={(event) => setImportSegments(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <span>Importar segmentos complementares com base nas configurações selecionadas.</span>
                  </label>
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  A aba da planilha indica observações e segmentos como itens opcionais de importação nesta etapa do
                  fluxo do professor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Submenus</CardTitle>
            <CardDescription>Navegue pelos blocos do protocolo físico.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {protocolPages.map((page) => (
              <Link
                key={page.slug}
                to={`/protocolo-avaliacao-fisica/${page.slug}`}
                className={[
                  'block rounded-xl border px-4 py-3 text-sm transition-colors',
                  page.slug === 'antropometria'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40',
                ].join(' ')}
              >
                <span className="block font-semibold">{page.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{page.description}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Configurações anatômicas</CardTitle>
          <CardDescription>
            Os campos abaixo representam as referências estruturais citadas na planilha como Antr1 e Antr2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MeasurementGrid
            values={form}
            onChange={handleFieldChange}
            items={[
              {
                key: 'olecranoAcromioClavicular',
                label: 'Olecrano-Acrômio Clavicular',
                helper: 'Último valor preenchido vira configuração Antr1.',
              },
              {
                key: 'ligamentoInguinalPatela',
                label: 'Ligamento inguinal-borda superior da patela',
                helper: 'Último valor preenchido vira configuração Antr2.',
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Medidas principais</CardTitle>
          <CardDescription>
            Organização inicial dos campos com base na ordem e nos agrupamentos observados na aba Prof-ANTR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Tronco</h2>
              <p className="text-sm text-muted-foreground">Medidas centrais de pescoço, tórax, cintura, abdome e quadril.</p>
            </div>
            <MeasurementGrid
              values={form}
              onChange={handleFieldChange}
              items={[
                { key: 'pescoco', label: 'Pescoço' },
                { key: 'busto', label: 'Busto' },
                { key: 'cintura', label: 'Cintura' },
                { key: 'escapular', label: 'Escapular' },
                { key: 'toracicaInspirada', label: 'Torácica Inspirada' },
                { key: 'toracicaExpirada', label: 'Torácica Expirada' },
                { key: 'abdominal', label: 'Abdominal' },
                { key: 'quadril', label: 'Quadril' },
                { key: 'cristaIliaca', label: 'Crista Ilíaca' },
              ]}
            />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Membros superiores</h2>
              <p className="text-sm text-muted-foreground">
                Campos de braço e antebraço para leitura relaxada, contraída e periférica.
              </p>
            </div>
            <MeasurementGrid
              values={form}
              onChange={handleFieldChange}
              items={[
                { key: 'bracoDireitoRelaxado', label: 'Braço Direito Relaxado' },
                { key: 'bracoDireitoContraido', label: 'Braço Direito Contraído' },
                { key: 'bracoEsquerdoRelaxado', label: 'Braço Esquerdo Relaxado' },
                { key: 'bracoEsquerdoContraido', label: 'Braço Esquerdo Contraído' },
                { key: 'antebracoDireito', label: 'Antebraço Direito' },
                { key: 'antebracoEsquerdo', label: 'Antebraço Esquerdo' },
              ]}
            />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Membros inferiores</h2>
              <p className="text-sm text-muted-foreground">
                A leitura de coxa usa a metade de Antr2 como referência visual complementar: {midpointReference}.
              </p>
            </div>
            <MeasurementGrid
              values={form}
              onChange={handleFieldChange}
              items={[
                {
                  key: 'coxaDireita',
                  label: `Coxa Direita (${midpointReference})`,
                  helper: 'Linha horizontal na metade da distância entre ligamento inguinal e patela.',
                },
                { key: 'pernaDireita', label: 'Perna Direita' },
                {
                  key: 'coxaEsquerda',
                  label: `Coxa Esquerda (${midpointReference})`,
                  helper: 'Linha horizontal na metade da distância entre ligamento inguinal e patela.',
                },
                { key: 'pernaEsquerda', label: 'Perna Esquerda' },
                { key: 'coxaAltaDireita', label: 'Coxa Alta Direita' },
                { key: 'coxaAltaEsquerda', label: 'Coxa Alta Esquerda' },
                { key: 'coxaBaixaDireita', label: 'Coxa Baixa Direita' },
                { key: 'coxaBaixaEsquerda', label: 'Coxa Baixa Esquerda' },
              ]}
            />
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Segmentos complementares</CardTitle>
          <CardDescription>
            A planilha prevê importação de segmentos extras e criação de segmentos personalizados pelo professor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleAddSegment}>
              + Importar segmento
            </Button>
            <span className="text-sm text-muted-foreground">
              {importSegments
                ? 'Importação de segmentos marcada como ativa.'
                : 'Importação de segmentos desmarcada nesta prévia.'}
            </span>
          </div>

          {customSegments.length > 0 ? (
            <div className="grid gap-4">
              {customSegments.map((segment, index) => (
                <div key={segment.id} className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <Input
                    label={`Segmento personalizado ${index + 1}`}
                    value={segment.name}
                    onChange={(event) => handleSegmentChange(segment.id, 'name', event.target.value)}
                    placeholder="Nome do segmento"
                  />
                  <Input
                    label="Valor"
                    value={segment.value}
                    onChange={(event) => handleSegmentChange(segment.id, 'value', event.target.value)}
                    placeholder="0,0"
                  />
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={() => handleRemoveSegment(segment.id)}>
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm leading-6 text-muted-foreground">
              Nenhum segmento extra foi adicionado ainda. A ação acima já prepara o comportamento solicitado na planilha
              para personalização e importação de segmentos.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Guia técnico por medida</CardTitle>
          <CardDescription>
            A planilha detalha descrição, imagem por sexo e vídeo tutorial por item. Nesta etapa, já conectei as
            descrições e os links de vídeo, deixando a área visual preparada para a próxima integração das imagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            Integração prevista na próxima etapa: imagem feminina e imagem masculina para cada medida, com tooltip ou
            painel lateral conforme avançarmos na construção da tela.
          </div>

          <Accordion type="single" collapsible defaultValue={anthropometryHelpItems[0]?.id}>
            {anthropometryHelpItems.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="text-base font-semibold text-foreground">
                  {item.title}
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  <a
                    href={item.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                  >
                    {item.videoLabel}
                  </a>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Variáveis relacionadas no sistema</CardTitle>
          <CardDescription>
            Blocos antropométricos já existentes no histórico da avaliação física e alinhados com esta tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {relatedSections.map((section) => (
              <div key={`${section.title}-${section.subtitle ?? 'base'}`} className="rounded-2xl border border-border bg-muted/30 p-5">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                  {section.subtitle ? <p className="text-sm text-muted-foreground">{section.subtitle}</p> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {section.variables.map((variable) => (
                    <span
                      key={variable}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {variable}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
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
            <CardDescription>
              Diretriz operacional da seção atual para orientar coleta, registro e leitura técnica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-foreground">{currentProtocol.objective}</p>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Pontos de atenção
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                {currentProtocol.highlights.map((highlight) => (
                  <div key={highlight} className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-foreground">
                    {highlight}
                  </div>
                ))}
              </div>
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
              const href = `/protocolo-avaliacao-fisica/${page.slug}`;
              const active = page.slug === currentProtocol.slug;

              return (
                <Link
                  key={page.slug}
                  to={href}
                  className={[
                    'block rounded-xl border px-4 py-3 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40',
                  ].join(' ')}
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
          <CardDescription>
            Referência rápida das seções já mapeadas no sistema e conectadas a este submenu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {relatedSections.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {relatedSections.map((section) => (
                <div key={`${section.title}-${section.subtitle ?? 'base'}`} className="rounded-2xl border border-border bg-muted/30 p-5">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                    {section.subtitle ? <p className="text-sm text-muted-foreground">{section.subtitle}</p> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {section.variables.map((variable) => (
                      <span
                        key={variable}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                      >
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm leading-6 text-muted-foreground">
              Este submenu já está preparado no menu lateral e pronto para receber sua tela dedicada na próxima etapa.
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
