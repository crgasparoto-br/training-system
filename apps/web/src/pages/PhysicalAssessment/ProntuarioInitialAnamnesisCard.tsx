import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { canAccessBlock } from '../../access/access-control';
import { prontuarioInitialAnamnesisService, type ProntuarioClinicalIdentity } from '../../services/prontuario-initial-anamnesis.service';
import { prontuarioService } from '../../services/prontuario.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatDateBR } from '../../utils/date';
import type { StudentSegmentedIntake } from '../../services/aluno.service';
import type { StudentParqSubmission } from '@corrida/types';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type JsonRecord = Record<string, unknown>;

const knownFieldLabels: Record<string, string> = {
  medicalHistory: 'Histórico médico',
  trainingBackground: 'Histórico de treino',
  currentMedications: 'Medicações em uso',
  injuriesHistory: 'Histórico de lesões',
  mainGoal: 'Objetivo principal',
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean' || typeof value === 'number') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  const record = asRecord(value);
  return record ? Object.values(record).some(hasMeaningfulValue) : false;
}

function humanizeKey(key: string) {
  if (knownFieldLabels[key]) return knownFieldLabels[key];
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatStructuredValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const items = value.map(formatStructuredValue).filter((item) => item !== 'Não informado');
    return items.length ? items.join(', ') : 'Não informado';
  }

  const record = asRecord(value);
  if (!record) return 'Não informado';

  const items = Object.entries(record)
    .filter(([, entry]) => hasMeaningfulValue(entry))
    .map(([key, entry]) => `${humanizeKey(key)}: ${formatStructuredValue(entry)}`);
  return items.length ? items.join(' · ') : 'Não informado';
}

function hasInitialAnamnesisContent(intake: StudentSegmentedIntake | null) {
  if (!intake) return false;
  if (intake.status === 'COMPLETED' || intake.status === 'IN_PROGRESS') return true;

  const raw = asRecord(intake.rawFormResponses);
  return [
    intake.assessmentDate,
    intake.questionnaires?.american,
    intake.clinicalHistory,
    intake.medications,
    intake.injuries,
    intake.allergies,
    intake.observations,
    raw?.mainGoal,
  ].some(hasMeaningfulValue);
}

function statusLabel(status?: StudentSegmentedIntake['status']) {
  if (status === 'COMPLETED') return 'Concluída';
  if (status === 'IN_PROGRESS') return 'Em andamento';
  return 'Não iniciada';
}

function ClinicalField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 text-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-foreground">{formatStructuredValue(value)}</div>
    </div>
  );
}

export function ProntuarioInitialAnamnesisCard({ alunoId }: { alunoId: string }) {
  const user = useAuthStore((state) => state.user);
  const canViewSummary = canAccessBlock(user, 'physicalAssessment.prnt.summary');
  const canViewAnamnesis = canAccessBlock(user, 'physicalAssessment.prnt.anamnesisFollowUp');
  const canViewParq = canAccessBlock(user, 'physicalAssessment.prnt.parqSubmissions');

  const [identity, setIdentity] = useState<ProntuarioClinicalIdentity | null>(null);
  const [identityState, setIdentityState] = useState<LoadState>('idle');
  const [intake, setIntake] = useState<StudentSegmentedIntake | null>(null);
  const [intakeState, setIntakeState] = useState<LoadState>('idle');
  const [parqSubmissions, setParqSubmissions] = useState<StudentParqSubmission[]>([]);
  const [parqState, setParqState] = useState<LoadState>('idle');

  useEffect(() => {
    let active = true;

    setIdentity(null);
    setIntake(null);
    setParqSubmissions([]);
    setIdentityState(canViewSummary ? 'loading' : 'idle');
    setIntakeState(canViewAnamnesis ? 'loading' : 'idle');
    setParqState(canViewParq ? 'loading' : 'idle');

    if (canViewSummary) {
      prontuarioInitialAnamnesisService
        .identity(alunoId)
        .then((data) => {
          if (!active) return;
          setIdentity(data);
          setIdentityState('loaded');
        })
        .catch(() => {
          if (active) setIdentityState('error');
        });
    }

    if (canViewAnamnesis) {
      prontuarioInitialAnamnesisService
        .initialAnamnesis(alunoId)
        .then((data) => {
          if (!active) return;
          setIntake(data);
          setIntakeState('loaded');
        })
        .catch(() => {
          if (active) setIntakeState('error');
        });
    }

    if (canViewParq) {
      prontuarioService
        .listParqSubmissions(alunoId)
        .then((data) => {
          if (!active) return;
          setParqSubmissions(data);
          setParqState('loaded');
        })
        .catch(() => {
          if (active) setParqState('error');
        });
    }

    return () => {
      active = false;
    };
  }, [alunoId, canViewAnamnesis, canViewParq, canViewSummary]);

  const hasAnamnesis = useMemo(() => hasInitialAnamnesisContent(intake), [intake]);
  const hasParq = parqSubmissions.length > 0;
  const rawFormResponses = asRecord(intake?.rawFormResponses);
  const mainGoal = rawFormResponses?.mainGoal;
  const loading =
    identityState === 'loading' || intakeState === 'loading' || parqState === 'loading';
  const canDetermineCombinedEmpty =
    canViewAnamnesis && canViewParq && intakeState === 'loaded' && parqState === 'loaded';
  const showCombinedEmpty = canDetermineCombinedEmpty && !hasAnamnesis && !hasParq;

  if (!canViewSummary && !canViewAnamnesis && !canViewParq) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Registro clínico da pré-matrícula
            </p>
            <CardTitle className="mt-1">Anamnese Inicial</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Respostas canônicas informadas na entrada, exibidas somente para consulta. O acompanhamento profissional dos itens positivos do PAR-Q permanece separado abaixo.
            </CardDescription>
          </div>
          <Link
            to={`/pre-matriculas/${alunoId}`}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Voltar à pré-matrícula
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {identity ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="text-sm font-semibold text-foreground">
              {identity.name || 'Nome não informado'}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {identity.email || `Registro ${identity.alunoId}`}
            </div>
          </div>
        ) : identityState === 'error' ? (
          <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Não foi possível carregar a identificação deste registro. Os formulários clínicos continuam sendo carregados conforme suas permissões.
          </div>
        ) : null}

        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando Anamnese e PAR-Q disponíveis...
          </p>
        ) : null}

        {intakeState === 'error' ? (
          <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Não foi possível carregar a Anamnese Inicial. O PAR-Q continua disponível abaixo quando autorizado.
          </div>
        ) : null}

        {parqState === 'error' ? (
          <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Não foi possível carregar o PAR-Q. A Anamnese Inicial permanece disponível quando autorizada.
          </div>
        ) : null}

        {showCombinedEmpty ? (
          <div role="status" className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            Ainda não existem Anamnese ou PAR-Q preenchidos para esta pré-matrícula.
          </div>
        ) : null}

        {canViewAnamnesis && intakeState === 'loaded' && !hasAnamnesis && !showCombinedEmpty ? (
          <div role="status" className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Anamnese Inicial ainda não possui conteúdo preenchido.
          </div>
        ) : null}

        {hasAnamnesis && intake ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ClinicalField label="Status da Anamnese" value={statusLabel(intake.status)} />
              <ClinicalField
                label="Data da Anamnese Inicial"
                value={intake.assessmentDate ? formatDateBR(intake.assessmentDate) : null}
              />
              <ClinicalField label="Objetivo principal declarado" value={mainGoal} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ClinicalField label="Histórico clínico e de treino" value={intake.clinicalHistory} />
              <ClinicalField label="Medicações em uso" value={intake.medications} />
              <ClinicalField label="Lesões e restrições relatadas" value={intake.injuries} />
              <ClinicalField label="Alergias" value={intake.allergies} />
              <ClinicalField label="Questionário AHA" value={intake.questionnaires?.american} />
              <ClinicalField label="Observações da Anamnese" value={intake.observations} />
            </div>
          </div>
        ) : null}

        {canViewParq && parqState === 'loaded' ? (
          hasParq ? (
            <div role="status" className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              PAR-Q preenchido disponível para consulta na seção PAR-Q do PRNT. O histórico original permanece somente leitura.
            </div>
          ) : !showCombinedEmpty ? (
            <div role="status" className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              PAR-Q ainda não possui conteúdo preenchido.
            </div>
          ) : null
        ) : null}

        {!canViewAnamnesis ? (
          <p className="text-xs text-muted-foreground">
            Seu perfil não possui permissão para consultar a Anamnese Inicial.
          </p>
        ) : null}
        {!canViewParq ? (
          <p className="text-xs text-muted-foreground">
            Seu perfil não possui permissão para consultar as respostas do PAR-Q.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
