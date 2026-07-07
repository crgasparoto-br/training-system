import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, History, Lock, Plus, RefreshCw, Save } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/Accordion';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { professorService } from '../../services/professor.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAnthropometry } from '../../hooks/useAnthropometry';
import type { AnthropometryObservation, AnthropometrySegment } from '../../types/anthropometry';
import { AnthropometryComparisonTable } from './AnthropometryComparisonTable';
import { AnthropometryHelpDialog } from './AnthropometryHelpDialog';
import { AnthropometrySegmentSettings } from './AnthropometrySegmentSettings';

type ProfessorOption = {
  id: string;
  name: string;
};

type GuidedStepTone = 'done' | 'current' | 'pending';

type GuidedStep = {
  title: string;
  description: string;
  tone: GuidedStepTone;
};

const protocolLinks = [
  ['antropometria', 'Antropometria'],
  ['prontuario-entrevista-acompanhamento', 'Prontuário de entrevista e acompanhamento'],
  ['adipometria', 'Adipometria'],
  ['bioimpedanciometria', 'Bioimpedanciometria'],
  ['ultrassonografia', 'Ultrassonografia'],
] as const;

const toDateInput = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

const guidedStepClass: Record<GuidedStepTone, string> = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  current: 'border-primary/40 bg-primary/5 text-foreground',
  pending: 'border-border bg-muted/20 text-muted-foreground',
};

function GuidedStepCard({ title, description, tone }: GuidedStep) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${guidedStepClass[tone]}`}>
      <div className="flex items-center gap-2 font-semibold">
        {tone === 'done' ? <CheckCircle2 className="h-4 w-4" /> : null}
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
    </div>
  );
}

export function AnthropometryScreen() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAlunoId = searchParams.get('alunoId') || '';
  const startedFromCentral = Boolean(initialAlunoId);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState(initialAlunoId);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [helpSegment, setHelpSegment] = useState<AnthropometrySegment | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [header, setHeader] = useState({ assessmentDate: toDateInput(), professorId: '', notes: '' });
  const [observations, setObservations] = useState<Array<Pick<AnthropometryObservation, 'segmentId' | 'text' | 'importable'>>>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedAluno = alunos.find((aluno) => aluno.id === selectedAlunoId);
  const alunoSex = selectedAluno?.user.profile.gender;
  const anthropometry = useAnthropometry(selectedAlunoId || undefined, alunoSex);

  const currentAssessment = anthropometry.currentAssessment;
  const selectedReadOnlyAssessment =
    anthropometry.selectedAssessment && anthropometry.selectedAssessment.id !== currentAssessment?.id
      ? anthropometry.selectedAssessment
      : null;
  const previousAssessments = anthropometry.assessments.slice(1);
  const effectiveProfessorId = header.professorId || user?.professor?.id || '';
  const centralAlunoPath = selectedAlunoId ? `/central-do-aluno/${selectedAlunoId}` : '/central-do-aluno';

  useEffect(() => {
    async function loadMetadata() {
      const [alunoResult, professorResult] = await Promise.all([
        alunoService.list(1, 100, undefined, 'active'),
        professorService.list('active'),
      ]);
      setAlunos(alunoResult.alunos);
      setProfessors(
        professorResult.map((professor) => ({
          id: professor.id,
          name: professor.user.profile.name,
        }))
      );
    }

    void loadMetadata();
  }, []);

  useEffect(() => {
    if (!selectedAlunoId) return;
    setSearchParams({ alunoId: selectedAlunoId });
  }, [selectedAlunoId, setSearchParams]);

  useEffect(() => {
    if (!currentAssessment) {
      setValues({});
      setHeader({
        assessmentDate: toDateInput(),
        professorId: user?.professor?.id || '',
        notes: '',
      });
      setObservations([]);
      return;
    }

    setValues(
      Object.fromEntries(currentAssessment.values.map((item) => [item.segmentId, item.value ?? '']))
    );
    setHeader({
      assessmentDate: toDateInput(currentAssessment.assessmentDate),
      professorId: currentAssessment.professorId || user?.professor?.id || '',
      notes: currentAssessment.notes || '',
    });
    setObservations(
      currentAssessment.observations.length
        ? currentAssessment.observations.map((item) => ({
            segmentId: item.segmentId,
            text: item.text,
            importable: item.importable,
          }))
        : [{ segmentId: null, text: '', importable: false }]
    );
  }, [currentAssessment?.id, user?.professor?.id]);

  const sortedAssessments = useMemo(
    () => [...anthropometry.assessments].sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime()),
    [anthropometry.assessments]
  );

  const guidedSteps: GuidedStep[] = useMemo(
    () => [
      {
        title: '1. Aluno preservado',
        description: selectedAluno
          ? `${selectedAluno.user.profile.name} está vinculado ao fluxo atual.`
          : 'Selecione ou aguarde o aluno carregado pela Central.',
        tone: selectedAluno ? 'done' : 'current',
      },
      {
        title: '2. Cabeçalho obrigatório',
        description: header.assessmentDate && effectiveProfessorId
          ? 'Data e responsável definidos para rastreabilidade.'
          : 'Informe data e responsável antes de criar ou salvar a avaliação.',
        tone: header.assessmentDate && effectiveProfessorId ? 'done' : selectedAluno ? 'current' : 'pending',
      },
      {
        title: '3. Coleta guiada',
        description: currentAssessment
          ? 'Preencha as medidas principais em centímetros e use ajuda técnica quando necessário.'
          : 'Crie a avaliação ANTR para liberar a tabela de medidas.',
        tone: currentAssessment ? 'done' : selectedAluno ? 'current' : 'pending',
      },
      {
        title: '4. Salvar e voltar à Central',
        description: currentAssessment
          ? 'Salvar atualiza o registro para consulta no histórico e no card da Central.'
          : 'A avaliação ainda não conta como concluída enquanto não houver registro salvo.',
        tone: currentAssessment ? 'current' : 'pending',
      },
    ],
    [currentAssessment, effectiveProfessorId, header.assessmentDate, selectedAluno]
  );

  const validateRequiredHeader = () => {
    if (!selectedAlunoId) {
      setValidationError('Selecione um aluno antes de iniciar a antropometria.');
      return false;
    }

    if (!header.assessmentDate) {
      setValidationError('Informe a data da avaliação antes de continuar.');
      return false;
    }

    if (!effectiveProfessorId) {
      setValidationError('Informe o professor responsável antes de continuar.');
      return false;
    }

    setValidationError(null);
    return true;
  };

  const handleCreateAssessment = async () => {
    if (!validateRequiredHeader()) return;

    const created = await anthropometry.createNewAssessment(effectiveProfessorId);
    if (created) {
      setHeader({
        assessmentDate: toDateInput(created.assessmentDate),
        professorId: created.professorId || effectiveProfessorId,
        notes: created.notes || '',
      });
    }
  };

  const handleSave = async () => {
    if (!currentAssessment || !validateRequiredHeader()) return;
    await anthropometry.updateHeader(currentAssessment.id, {
      ...header,
      professorId: effectiveProfessorId,
    });
    await anthropometry.saveValues(
      currentAssessment.id,
      anthropometry.segments.map((segment) => ({
        segmentId: segment.id,
        value: values[segment.id] ?? '',
        unit: 'cm',
      }))
    );
    await anthropometry.saveObservations(currentAssessment.id, observations.filter((item) => item.text.trim()));
  };

  const updateObservation = (index: number, field: 'text' | 'importable', value: string | boolean) => {
    setObservations((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  };

  const protocolLinkTo = (slug: string) =>
    selectedAlunoId ? `/protocolo-avaliacao-fisica/${slug}?alunoId=${selectedAlunoId}` : `/protocolo-avaliacao-fisica/${slug}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Avaliação Física</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Avaliação Antropométrica</h1>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            Histórico por aluno com avaliações ANTR lado a lado, segmentos configuráveis e ajuda técnica por medida.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {protocolLinks.map(([slug, label]) => (
            <Link
              key={slug}
              to={protocolLinkTo(slug)}
              className={slug === 'antropometria' ? 'rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary' : 'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted'}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {startedFromCentral ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Fluxo iniciado pela Central do Aluno
                </CardTitle>
                <CardDescription>
                  O aluno veio pré-selecionado pela Central e fica protegido contra troca acidental durante a coleta.
                </CardDescription>
              </div>
              <Link to={centralAlunoPath}>
                <Button variant="outline" size="sm">Voltar à Central</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {guidedSteps.map((step) => <GuidedStepCard key={step.title} {...step} />)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Aluno e avaliação atual</CardTitle>
          <CardDescription>Escolha o aluno, crie uma nova avaliação ou edite a avaliação ANTR mais recente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_180px_minmax(220px,0.8fr)_auto_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Aluno <span className="text-destructive">*</span>
              </label>
              <select
                value={selectedAlunoId}
                disabled={startedFromCentral}
                onChange={(event) => setSelectedAlunoId(event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
              >
                <option value="">Selecione um aluno</option>
                {alunos.map((aluno) => (
                  <option key={aluno.id} value={aluno.id}>
                    {aluno.user.profile.name}
                  </option>
                ))}
              </select>
              {startedFromCentral ? (
                <p className="mt-1 text-xs text-muted-foreground">Aluno travado porque o fluxo foi iniciado pela Central.</p>
              ) : null}
            </div>

            <Input
              label="Data *"
              type="date"
              value={header.assessmentDate}
              disabled={!selectedAlunoId}
              onChange={(event) => setHeader((current) => ({ ...current, assessmentDate: event.target.value }))}
            />

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Professor <span className="text-destructive">*</span>
              </label>
              <select
                value={effectiveProfessorId}
                disabled={!selectedAlunoId}
                onChange={(event) => setHeader((current) => ({ ...current, professorId: event.target.value }))}
                className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
              >
                <option value="">Professor atual</option>
                {professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="button" onClick={handleCreateAssessment} disabled={!selectedAlunoId} isLoading={anthropometry.saving}>
                <Plus className="h-4 w-4" />
                Nova avaliação
              </Button>
            </div>

            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={handleSave} disabled={!currentAssessment} isLoading={anthropometry.saving}>
                <Save className="h-4 w-4" />
                Salvar
              </Button>
            </div>
          </div>

          {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}
          {anthropometry.error ? <p className="text-sm text-destructive">{anthropometry.error}</p> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground">
              <span className="font-semibold">Campos obrigatórios:</span> aluno, data e professor responsável.
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Medidas e observações seguem como campos de coleta. Preencha conforme protocolo aplicado antes de salvar.
            </div>
          </div>

          {currentAssessment ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground">
              Avaliação atual: <strong>{currentAssessment.code}</strong>. As avaliações anteriores permanecem somente leitura na comparação.
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Selecione um aluno e clique em Nova avaliação para gerar ANTR-001 ou o próximo código sequencial. Enquanto isso não for feito, nada conta como avaliação concluída.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAlunoId ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Comparação lado a lado</CardTitle>
              <CardDescription>Primeira coluna com segmento, ajuda visual e avaliações ANTR em colunas.</CardDescription>
            </CardHeader>
            <CardContent>
              {anthropometry.loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Carregando histórico...
                </div>
              ) : currentAssessment ? (
                <AnthropometryComparisonTable
                  assessments={sortedAssessments}
                  currentAssessmentId={currentAssessment.id}
                  segments={anthropometry.segments}
                  values={values}
                  onValueChange={(segmentId, value) => setValues((current) => ({ ...current, [segmentId]: value }))}
                  onOpenHelp={setHelpSegment}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Ainda não há avaliações antropométricas para este aluno.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Observações</CardTitle>
              <CardDescription>Observações podem ser digitadas, importadas da anterior conforme configuração e editadas antes de salvar.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible defaultValue="observations">
                <AccordionItem value="observations">
                  <AccordionTrigger>Observações da avaliação atual</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <textarea
                      value={header.notes}
                      disabled={!currentAssessment}
                      onChange={(event) => setHeader((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Observações gerais da avaliação"
                      className="min-h-[96px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
                    />

                    {observations.map((item, index) => (
                      <div key={index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <Input
                          value={item.text}
                          disabled={!currentAssessment}
                          onChange={(event) => updateObservation(index, 'text', event.target.value)}
                          placeholder="Ex.: Percentual de gordura 20% ou menos"
                        />
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={item.importable}
                            disabled={!currentAssessment}
                            onChange={(event) => updateObservation(index, 'importable', event.target.checked)}
                            className="h-4 w-4 rounded border-border"
                          />
                          Importar na próxima
                        </label>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!currentAssessment}
                      onClick={() => setObservations((current) => [...current, { segmentId: null, text: '', importable: false }])}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar observação
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico e configurações</CardTitle>
              <CardDescription>Áreas extensas ficam recolhidas para manter a avaliação atual acessível.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Accordion type="single" collapsible>
                <AccordionItem value="history">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Histórico de avaliações antigas
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {previousAssessments.length ? (
                      <div className="grid gap-2">
                        {previousAssessments.map((assessment) => (
                          <button
                            key={assessment.id}
                            type="button"
                            onClick={() => anthropometry.setSelectedAssessmentId(assessment.id)}
                            className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm hover:bg-muted"
                          >
                            <strong>{assessment.code}</strong> em {new Date(assessment.assessmentDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma avaliação anterior cadastrada.</p>
                    )}

                    {selectedReadOnlyAssessment ? (
                      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                        <h3 className="text-sm font-semibold text-foreground">
                          {selectedReadOnlyAssessment.code} em{' '}
                          {new Date(selectedReadOnlyAssessment.assessmentDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedReadOnlyAssessment.notes || 'Sem observações gerais cadastradas.'}
                        </p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {selectedReadOnlyAssessment.observations.map((observation) => (
                            <div key={observation.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                              {observation.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <AnthropometrySegmentSettings segments={anthropometry.segments} onChanged={anthropometry.load} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <AnthropometryHelpDialog segment={helpSegment} alunoSex={alunoSex} onClose={() => setHelpSegment(null)} />
    </div>
  );
}
