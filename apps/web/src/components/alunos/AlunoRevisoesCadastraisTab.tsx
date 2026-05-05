import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import {
  alunoService,
  type AlunoProfileReview,
  type AlunoProfileReviewSettingsResponse,
} from '../../services/aluno.service';
import { formatDateBR, toDateInputValue, toIsoDateAtNoonUTC } from '../../utils/date';

type ToastType = 'success' | 'error';

type AlunoRevisoesCadastraisTabProps = {
  alunoId: string;
  onToast: (message: string, type?: ToastType) => void;
};

type CurrentStatus = 'em-dia' | 'pendente' | 'vencida';

const statusPillClass: Record<CurrentStatus, string> = {
  'em-dia': 'bg-success/10 text-success',
  pendente: 'bg-warning/10 text-warning',
  vencida: 'bg-destructive/10 text-destructive',
};

const reviewStatusLabel: Record<string, string> = {
  pending: 'Pendente',
  completed_no_changes: 'Concluída sem alterações',
  completed_with_changes: 'Concluída com alterações',
  expired: 'Expirada',
  canceled: 'Cancelada',
};

const changedFieldLabelMap: Record<string, string> = {
  'profile.name': 'Nome',
  'profile.phone': 'Telefone',
  'profile.birthDate': 'Data de nascimento',
  'profile.gender': 'Sexo',
  'profile.cpf': 'CPF',
  'profile.rg': 'RG',
  'profile.maritalStatus': 'Estado civil',
  'profile.addressStreet': 'Rua',
  'profile.addressNumber': 'Número',
  'profile.addressComplement': 'Complemento',
  'profile.addressNeighborhood': 'Bairro',
  'profile.addressCity': 'Cidade',
  'profile.addressState': 'Estado',
  'profile.addressZipCode': 'CEP',
  'profile.instagramHandle': 'Instagram',
  'aluno.age': 'Idade',
  'aluno.weight': 'Peso',
  'aluno.height': 'Altura',
  'aluno.bodyFatPercentage': 'Percentual de gordura',
  'aluno.vo2Max': 'VO2 máximo',
  'aluno.anaerobicThreshold': 'Limiar anaeróbico',
  'aluno.maxHeartRate': 'FC máxima',
  'aluno.restingHeartRate': 'FC repouso',
  'aluno.systolicPressure': 'Pressão sistólica',
  'aluno.diastolicPressure': 'Pressão diastólica',
  'intakeForm.assessmentDate': 'Data da anamnese',
  'intakeForm.mainGoal': 'Objetivo principal',
  'intakeForm.medicalHistory': 'Histórico médico',
  'intakeForm.currentMedications': 'Medicações atuais',
  'intakeForm.injuriesHistory': 'Histórico de lesões',
  'intakeForm.trainingBackground': 'Histórico de treino',
  'intakeForm.observations': 'Observações',
  'intakeForm.parqResponses': 'PAR-Q',
};

const asDateOrNull = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const safeSortByRequestedAt = (reviews: AlunoProfileReview[]) =>
  [...reviews].sort(
    (left, right) =>
      (asDateOrNull(right.requestedAt)?.getTime() ?? 0) -
      (asDateOrNull(left.requestedAt)?.getTime() ?? 0)
  );

const getApprovalLabel = (review: AlunoProfileReview) => {
  if (review.approval?.hasPendingApproval) return 'Pendente de aprovação';
  if (review.approval?.approvedAt) return 'Aprovada';
  if (review.approval?.rejectedAt) return 'Rejeitada';
  if (!review.changedFields?.length) return 'Não se aplica';
  return 'Sem necessidade';
};

const getCurrentStatus = (
  reviews: AlunoProfileReview[],
  effectiveNextReviewAt?: string | null
): CurrentStatus => {
  const now = new Date();
  const pending = reviews.find((item) => item.status === 'pending');

  if (pending) {
    const pendingDueAt = asDateOrNull(pending.dueAt);
    if (pendingDueAt && pendingDueAt < now) {
      return 'vencida';
    }

    return 'pendente';
  }

  const nextReviewDate = asDateOrNull(effectiveNextReviewAt);
  if (nextReviewDate && nextReviewDate < now) {
    return 'vencida';
  }

  return 'em-dia';
};

const getChangedFieldLabel = (path: string) => changedFieldLabelMap[path] || path;

export function AlunoRevisoesCadastraisTab({ alunoId, onToast }: AlunoRevisoesCadastraisTabProps) {
  const [loading, setLoading] = useState(true);
  const [requestingNow, setRequestingNow] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [approvingByReviewId, setApprovingByReviewId] = useState<Record<string, boolean>>({});
  const [rejectingByReviewId, setRejectingByReviewId] = useState<Record<string, boolean>>({});
  const [rejectionReasonByReviewId, setRejectionReasonByReviewId] = useState<Record<string, string>>({});

  const [reviews, setReviews] = useState<AlunoProfileReview[]>([]);
  const [settingsResponse, setSettingsResponse] =
    useState<AlunoProfileReviewSettingsResponse | null>(null);

  const [isReviewRequired, setIsReviewRequired] = useState(true);
  const [reviewPeriodMonths, setReviewPeriodMonths] = useState('');
  const [nextReviewAtInput, setNextReviewAtInput] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsData, reviewsData] = await Promise.all([
        alunoService.getProfileReviewSettings(alunoId),
        alunoService.listProfileReviews(alunoId),
      ]);

      const orderedReviews = safeSortByRequestedAt(reviewsData);
      setSettingsResponse(settingsData);
      setReviews(orderedReviews);

      setIsReviewRequired(settingsData.settings?.isReviewRequired ?? settingsData.effective.isReviewRequired);
      setReviewPeriodMonths(
        settingsData.settings?.reviewPeriodMonths != null
          ? String(settingsData.settings.reviewPeriodMonths)
          : ''
      );
      setNextReviewAtInput(
        toDateInputValue(settingsData.settings?.nextReviewAt ?? settingsData.effective.nextReviewAt)
      );
    } catch (error: any) {
      onToast(error?.response?.data?.error || 'Erro ao carregar revisões cadastrais', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [alunoId]);

  const latestCompletedReview = useMemo(
    () =>
      [...reviews]
        .filter((review) => review.completedAt)
        .sort(
          (left, right) =>
            (asDateOrNull(right.completedAt)?.getTime() ?? 0) -
            (asDateOrNull(left.completedAt)?.getTime() ?? 0)
        )[0],
    [reviews]
  );

  const pendingSensitiveReviews = useMemo(
    () => reviews.filter((review) => review.approval?.hasPendingApproval),
    [reviews]
  );

  const currentStatus = useMemo(
    () => getCurrentStatus(reviews, settingsResponse?.effective.nextReviewAt),
    [reviews, settingsResponse?.effective.nextReviewAt]
  );

  const nextReviewDate = settingsResponse?.effective.nextReviewAt
    ? formatDateBR(settingsResponse.effective.nextReviewAt)
    : 'Não definida';

  const handleRequestNow = async () => {
    setRequestingNow(true);
    try {
      await alunoService.requestProfileReview(alunoId);
      onToast('Solicitação de revisão criada com sucesso', 'success');
      await loadData();
    } catch (error: any) {
      onToast(error?.response?.data?.error || 'Erro ao solicitar revisão cadastral', 'error');
    } finally {
      setRequestingNow(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const parsedMonths = reviewPeriodMonths.trim() === '' ? null : Number(reviewPeriodMonths);

      if (parsedMonths != null && (!Number.isFinite(parsedMonths) || parsedMonths < 1 || parsedMonths > 24)) {
        onToast('Período em meses deve ser entre 1 e 24', 'error');
        return;
      }

      await alunoService.updateProfileReviewSettings(alunoId, {
        isReviewRequired,
        reviewPeriodMonths: parsedMonths,
        nextReviewAt: nextReviewAtInput ? toIsoDateAtNoonUTC(nextReviewAtInput) : null,
      });

      onToast('Configuração de revisão cadastral atualizada', 'success');
      await loadData();
    } catch (error: any) {
      onToast(error?.response?.data?.error || 'Erro ao salvar configuração de revisão', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApprove = async (reviewId: string) => {
    setApprovingByReviewId((current) => ({ ...current, [reviewId]: true }));
    try {
      await alunoService.approveProfileReview(alunoId, reviewId);
      onToast('Alterações sensíveis aprovadas com sucesso', 'success');
      await loadData();
    } catch (error: any) {
      onToast(error?.response?.data?.error || 'Erro ao aprovar alterações sensíveis', 'error');
    } finally {
      setApprovingByReviewId((current) => ({ ...current, [reviewId]: false }));
    }
  };

  const handleReject = async (reviewId: string) => {
    const reason = rejectionReasonByReviewId[reviewId]?.trim();

    if (!reason || reason.length < 3) {
      onToast('Informe um motivo de rejeição com pelo menos 3 caracteres', 'error');
      return;
    }

    setRejectingByReviewId((current) => ({ ...current, [reviewId]: true }));
    try {
      await alunoService.rejectProfileReview(alunoId, reviewId, reason);
      onToast('Alterações sensíveis rejeitadas com sucesso', 'success');
      setRejectionReasonByReviewId((current) => ({ ...current, [reviewId]: '' }));
      await loadData();
    } catch (error: any) {
      onToast(error?.response?.data?.error || 'Erro ao rejeitar alterações sensíveis', 'error');
    } finally {
      setRejectingByReviewId((current) => ({ ...current, [reviewId]: false }));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisões Cadastrais</CardTitle>
          <CardDescription>Carregando dados de revisão cadastral...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Status da revisão cadastral</CardTitle>
              <CardDescription>
                Acompanhe pendências, histórico e próximas janelas de revisão do aluno.
              </CardDescription>
            </div>
            <Button onClick={handleRequestNow} isLoading={requestingNow}>
              Solicitar revisão agora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Última revisão</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {latestCompletedReview?.completedAt
                  ? formatDateBR(latestCompletedReview.completedAt)
                  : 'Nenhuma revisão concluída'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Próxima revisão</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{nextReviewDate}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Status atual</div>
              <div className="mt-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusPillClass[currentStatus]}`}>
                  {currentStatus === 'em-dia'
                    ? 'Em dia'
                    : currentStatus === 'pendente'
                      ? 'Pendente'
                      : 'Vencida'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuração individual</CardTitle>
          <CardDescription>
            Defina obrigatoriedade, período e próxima data específica para este aluno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm">
              <input
                type="checkbox"
                checked={isReviewRequired}
                onChange={(event) => setIsReviewRequired(event.target.checked)}
              />
              Revisão obrigatória
            </label>
            <Input
              type="number"
              min={1}
              max={24}
              label="Período em meses"
              placeholder="Ex.: 4"
              value={reviewPeriodMonths}
              onChange={(event) => setReviewPeriodMonths(event.target.value)}
            />
            <Input
              type="date"
              label="Próxima revisão"
              value={nextReviewAtInput}
              onChange={(event) => setNextReviewAtInput(event.target.value)}
            />
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-muted-foreground">
            {settingsResponse?.settings?.reviewPeriodMonths == null
              ? `Sem período individual salvo. Padrão atual do contrato: ${settingsResponse?.effective.reviewPeriodMonths ?? '-'} meses.`
              : `Período individual ativo: ${settingsResponse.settings.reviewPeriodMonths} meses.`}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} isLoading={savingSettings}>
              Salvar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aprovação de alterações sensíveis</CardTitle>
          <CardDescription>
            Alterações sensíveis enviadas pelo aluno ficam pendentes para aprovação ou rejeição.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingSensitiveReviews.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-muted-foreground">
              Não há alterações sensíveis pendentes de aprovação no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSensitiveReviews.map((review) => {
                const sensitivePendingFields = review.changedFields.filter(
                  (field) => field.requiresApproval && field.status === 'pending_approval'
                );

                return (
                  <div key={review.id} className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Revisão solicitada em {formatDateBR(review.requestedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {review.dueAt ? `Prazo: ${formatDateBR(review.dueAt)}` : 'Sem prazo definido'}
                        </div>
                      </div>
                      <span className="inline-flex rounded-full bg-warning/20 px-2 py-1 text-xs font-semibold text-warning">
                        Pendente de aprovação
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-gray-700">
                      <div className="font-medium">Campos sensíveis alterados:</div>
                      {sensitivePendingFields.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Sem detalhes de campos.</div>
                      ) : (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                          {sensitivePendingFields.map((field) => (
                            <li key={`${review.id}-${field.path}`}>{getChangedFieldLabel(field.path)}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="Motivo da rejeição (obrigatório para rejeitar)"
                        value={rejectionReasonByReviewId[review.id] || ''}
                        onChange={(event) =>
                          setRejectionReasonByReviewId((current) => ({
                            ...current,
                            [review.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        variant="success"
                        onClick={() => handleApprove(review.id)}
                        isLoading={approvingByReviewId[review.id] === true}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(review.id)}
                        isLoading={rejectingByReviewId[review.id] === true}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de revisões</CardTitle>
          <CardDescription>
            Consulta completa das solicitações e conclusões de revisão cadastral.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-muted-foreground">
              Este aluno ainda não possui revisões cadastrais registradas.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2">Solicitação</th>
                    <th className="px-3 py-2">Conclusão</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Teve alteração</th>
                    <th className="px-3 py-2">Campos alterados</th>
                    <th className="px-3 py-2">Aprovação/Rejeição</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => {
                    const changedFields = review.changedFields || [];
                    const changedLabel = changedFields.length
                      ? changedFields.map((field) => getChangedFieldLabel(field.path)).join(', ')
                      : 'Nenhum';

                    return (
                      <tr key={review.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{formatDateBR(review.requestedAt) || '-'}</td>
                        <td className="px-3 py-2">{formatDateBR(review.completedAt) || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            {reviewStatusLabel[review.status] || review.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">{changedFields.length > 0 ? 'Sim' : 'Não'}</td>
                        <td className="px-3 py-2 text-xs text-gray-700">{changedLabel}</td>
                        <td className="px-3 py-2 text-xs">{getApprovalLabel(review)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
