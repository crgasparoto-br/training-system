import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import type {
  Aluno,
  StudentContractLink,
  StudentSegmentedFinancialProfile,
} from '../../services/aluno.service';
import { alunoService } from '../../services/aluno.service';
import { contractService, type AvailableStudentContract } from '../../services/contract.service';

type FinancialInfo = {
  currentService?: string;
  specialCondition?: string;
  monthlyValue?: string;
  responsibleProfessorId?: string;
  responsibleProfessorName?: string;
  paymentDay?: string;
  contract?: string;
  otherObservations?: string;
};

type AlunoFinanceiroTabProps = {
  aluno: Aluno;
  alunoId: string;
  financialInfo: FinancialInfo;
  activeStudentContract?: StudentContractLink | null;
  canManageContracts: boolean;
  canCancelContracts: boolean;
  canRenewContracts: boolean;
  segmentedFinancialProfile?: StudentSegmentedFinancialProfile | null;
};

const studentContractStatusLabel: Record<string, string> = {
  draft: 'Rascunho',
  pending_signature: 'Pendente de assinatura',
  active: 'Ativo',
  expired: 'Expirado',
  canceled: 'Cancelado',
  terminated: 'Encerrado',
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('pt-BR');
};

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePaymentDayInput = (value: string) => {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }
  return parsed;
};

export function AlunoFinanceiroTab({
  aluno,
  alunoId,
  financialInfo,
  activeStudentContract,
  canManageContracts,
  canCancelContracts,
  canRenewContracts,
  segmentedFinancialProfile,
}: AlunoFinanceiroTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<StudentContractLink[]>([]);
  const [currentContract, setCurrentContract] = useState<StudentContractLink | null>(activeStudentContract ?? null);
  const [availableContracts, setAvailableContracts] = useState<AvailableStudentContract[]>([]);

  const [selectedAvailableContractId, setSelectedAvailableContractId] = useState('');
  const [selectedHistoryContractId, setSelectedHistoryContractId] = useState('');
  const [renewContractId, setRenewContractId] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editPaymentDay, setEditPaymentDay] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [startDateInput, setStartDateInput] = useState('');
  const [paymentDayInput, setPaymentDayInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  const [busyAction, setBusyAction] = useState<
    | null
    | 'link'
    | 'activate'
    | 'cancel'
    | 'renew'
    | 'update'
  >(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadContracts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await alunoService.listStudentContracts(alunoId);
      setContracts(response.contracts);
      setCurrentContract(response.activeContract);
      setSelectedHistoryContractId(response.activeContract?.id || response.contracts[0]?.id || '');
      if (response.activeContract) {
        setEditStartDate(response.activeContract.startDate?.slice(0, 10) || '');
        setEditEndDate(response.activeContract.endDate?.slice(0, 10) || '');
        setEditPaymentDay(response.activeContract.paymentDay ? String(response.activeContract.paymentDay) : '');
        setEditAmount(
          response.activeContract.amount !== null && response.activeContract.amount !== undefined
            ? String(response.activeContract.amount).replace('.', ',')
            : ''
        );
        setEditNotes(response.activeContract.notes || '');
      }
    } catch (loadError: any) {
      console.error('Erro ao carregar contratos do aluno:', loadError);
      setError(loadError?.response?.data?.error || 'Erro ao carregar contratos do aluno');
      setContracts([]);
      setCurrentContract(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableContracts = async () => {
    if (!canManageContracts) {
      return;
    }

    try {
      const response = await contractService.listAvailableForStudent({
        alunoId,
        onlyUnlinked: false,
        status: ['GENERATED', 'SENT', 'VIEWED', 'SIGNED'],
      });
      setAvailableContracts(response);
      setSelectedAvailableContractId((current) => current || response[0]?.id || '');
      setRenewContractId((current) => current || response[0]?.id || '');
    } catch (availableError: any) {
      console.error('Erro ao carregar contratos disponíveis:', availableError);
      setAvailableContracts([]);
    }
  };

  useEffect(() => {
    loadContracts();
  }, [alunoId, activeStudentContract?.id]);

  useEffect(() => {
    loadAvailableContracts();
  }, [alunoId, canManageContracts]);

  const activeContractLabel = currentContract
    ? `${currentContract.contract.title} (${studentContractStatusLabel[currentContract.status] || currentContract.status})`
    : segmentedFinancialProfile?.activeContract?.contract.title ||
      financialInfo.contract ||
      'Não informado';

  const activeContractService =
    segmentedFinancialProfile?.currentServiceName ||
    currentContract?.service?.name ||
    currentContract?.contract?.serviceId ||
    financialInfo.currentService;
  const activeContractAmount =
    segmentedFinancialProfile?.monthlyAmount ??
    currentContract?.amount ??
    currentContract?.service?.monthlyPrice ??
    parseCurrencyInput(financialInfo.monthlyValue || '');
  const activePaymentDay =
    segmentedFinancialProfile?.paymentDay ??
    currentContract?.paymentDay ??
    parsePaymentDayInput(financialInfo.paymentDay || '') ??
    null;
  const activeContractStartDate =
    segmentedFinancialProfile?.contractStartDate ?? currentContract?.startDate ?? null;
  const activeContractEndDate =
    segmentedFinancialProfile?.contractDueDate ?? currentContract?.endDate ?? null;
  const activeNotes =
    segmentedFinancialProfile?.notes ?? currentContract?.notes ?? financialInfo.otherObservations ?? null;

  const historyContracts = useMemo(
    () =>
      [...contracts].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [contracts]
  );

  const selectedHistoryContract = historyContracts.find((item) => item.id === selectedHistoryContractId) || null;

  const selectedAvailableContract =
    availableContracts.find((item) => item.id === selectedAvailableContractId) || null;
  const selectedRenewContract =
    availableContracts.find((item) => item.id === renewContractId) || null;

  const runAction = async (
    action: 'link' | 'activate' | 'cancel' | 'renew' | 'update',
    callback: () => Promise<void>
  ) => {
    setBusyAction(action);
    setFeedback(null);
    try {
      await callback();
      await Promise.all([loadContracts(), loadAvailableContracts()]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleLinkContract = async () => {
    if (!selectedAvailableContract) {
      setFeedback({ type: 'error', message: 'Selecione um contrato para vincular.' });
      return;
    }

    await runAction('link', async () => {
      const existingLink = contracts.find((item) => item.contractId === selectedAvailableContract.id);

      if (existingLink) {
        setFeedback({ type: 'success', message: 'Este contrato já está vinculado ao aluno.' });
        return;
      }

      await alunoService.linkStudentContract(alunoId, {
        contractId: selectedAvailableContract.id,
        serviceId: selectedAvailableContract.service?.id || null,
        startDate: startDateInput || null,
        paymentDay: parsePaymentDayInput(paymentDayInput),
        amount: selectedAvailableContract.service?.monthlyPrice ?? null,
        notes: notesInput || null,
      });

      setFeedback({ type: 'success', message: 'Contrato vinculado com sucesso.' });
      setStartDateInput('');
      setPaymentDayInput('');
      setNotesInput('');
    });
  };

  const handleActivateContract = async () => {
    if (!selectedHistoryContract) {
      setFeedback({ type: 'error', message: 'Selecione um contrato do histórico para ativar.' });
      return;
    }

    await runAction('activate', async () => {
      if (currentContract && currentContract.id !== selectedHistoryContract.id) {
        const confirmed = window.confirm(
          'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.'
        );
        if (!confirmed) return;
      }

      await alunoService.activateStudentContract(alunoId, selectedHistoryContract.id);
      setFeedback({ type: 'success', message: 'Contrato ativado com sucesso.' });
    });
  };

  const handleCancelContract = async () => {
    if (!currentContract) {
      setFeedback({ type: 'error', message: 'Não há contrato ativo para cancelar.' });
      return;
    }

    if (!cancelReason.trim() || cancelReason.trim().length < 3) {
      setFeedback({ type: 'error', message: 'Informe o motivo do cancelamento com pelo menos 3 caracteres.' });
      return;
    }

    await runAction('cancel', async () => {
      await alunoService.cancelStudentContract(alunoId, currentContract.id, cancelReason.trim());
      setFeedback({ type: 'success', message: 'Contrato cancelado com sucesso.' });
      setCancelReason('');
    });
  };

  const handleRenewContract = async () => {
    if (!selectedRenewContract) {
      setFeedback({ type: 'error', message: 'Selecione o contrato para renovação.' });
      return;
    }

    await runAction('renew', async () => {
      const existing = contracts.find((item) => item.contractId === selectedRenewContract.id);
      let linkId = existing?.id;

      if (!existing) {
        const created = await alunoService.linkStudentContract(alunoId, {
          contractId: selectedRenewContract.id,
          serviceId: selectedRenewContract.service?.id || null,
          startDate: startDateInput || null,
          paymentDay: parsePaymentDayInput(paymentDayInput),
          amount: selectedRenewContract.service?.monthlyPrice ?? null,
          notes: notesInput || null,
        });
        linkId = created.id;
      }

      if (!linkId) {
        throw new Error('Não foi possível preparar o contrato para renovação.');
      }

      if (currentContract && currentContract.id !== linkId) {
        const confirmed = window.confirm(
          'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.'
        );
        if (!confirmed) return;
      }

      await alunoService.activateStudentContract(alunoId, linkId);
      setFeedback({ type: 'success', message: 'Contrato renovado e ativado com sucesso.' });
      setStartDateInput('');
      setPaymentDayInput('');
      setNotesInput('');
    });
  };

  const handleUpdateCurrentContract = async () => {
    if (!currentContract) {
      setFeedback({ type: 'error', message: 'Não há contrato ativo para atualizar.' });
      return;
    }

    await runAction('update', async () => {
      await alunoService.updateStudentContract(alunoId, currentContract.id, {
        startDate: editStartDate || null,
        endDate: editEndDate || null,
        paymentDay: parsePaymentDayInput(editPaymentDay),
        amount: parseCurrencyInput(editAmount),
        notes: editNotes || null,
      });

      setFeedback({ type: 'success', message: 'Contrato atualizado com sucesso.' });
      setEditMode(false);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financeiro e contratos</CardTitle>
        <CardDescription>
          Aqui ficam os dados financeiros do aluno e a operação contratual do relacionamento, separados do cadastro e das avaliações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 px-4 py-6 text-sm text-muted-foreground">
            Carregando contratos do aluno...
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold text-gray-900">Contrato ativo</h3>
                {(canManageContracts || canCancelContracts || canRenewContracts) && currentContract && (
                  <div className="flex flex-wrap gap-2">
                    {canManageContracts && (
                      <Button size="sm" variant="outline" onClick={() => setEditMode((value) => !value)}>
                        Alterar
                      </Button>
                    )}
                    {canCancelContracts && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelContract}
                        disabled={busyAction !== null || !cancelReason.trim()}
                      >
                        {busyAction === 'cancel' ? 'Cancelando...' : 'Cancelar'}
                      </Button>
                    )}
                    {canRenewContracts && (
                      <Button
                        size="sm"
                        onClick={handleRenewContract}
                        disabled={busyAction !== null || !renewContractId}
                      >
                        {busyAction === 'renew' ? 'Renovando...' : 'Renovar'}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Nome do contrato</div>
                  <div className="text-sm font-semibold text-gray-900">{activeContractLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Serviço</div>
                  <div className="text-sm font-semibold text-gray-900">{activeContractService || 'Não informado'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {currentContract
                      ? studentContractStatusLabel[currentContract.status] || currentContract.status
                      : segmentedFinancialProfile?.activeContract
                        ? studentContractStatusLabel[segmentedFinancialProfile.activeContract.status] || segmentedFinancialProfile.activeContract.status
                        : 'Sem contrato ativo'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Valor</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrency(activeContractAmount) ? `R$ ${formatCurrency(activeContractAmount)}` : 'Não informado'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Data de início</div>
                  <div className="text-sm font-semibold text-gray-900">{formatDateLabel(activeContractStartDate) || 'Não informada'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Data de término</div>
                  <div className="text-sm font-semibold text-gray-900">{formatDateLabel(activeContractEndDate) || 'Não informada'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Dia de pagamento</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {activePaymentDay || 'Não informado'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Assinatura</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatDateLabel(currentContract?.signedAt || currentContract?.contract?.signedAt) || 'Sem assinatura'}
                  </div>
                </div>
              </div>

              {canCancelContracts && currentContract && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input
                    label="Motivo de cancelamento"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Ex.: inadimplência, troca de plano, encerramento solicitado"
                  />
                </div>
              )}

              {canManageContracts && editMode && currentContract && (
                <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-2">
                  <Input
                    type="date"
                    label="Data de início"
                    value={editStartDate}
                    onChange={(event) => setEditStartDate(event.target.value)}
                  />
                  <Input
                    type="date"
                    label="Data de término"
                    value={editEndDate}
                    onChange={(event) => setEditEndDate(event.target.value)}
                  />
                  <Input
                    label="Dia de pagamento"
                    value={editPaymentDay}
                    onChange={(event) => setEditPaymentDay(event.target.value)}
                    placeholder="1 a 31"
                  />
                  <Input
                    label="Valor"
                    value={editAmount}
                    onChange={(event) => setEditAmount(event.target.value)}
                    placeholder="0,00"
                  />
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-foreground">Observações financeiras/contratuais</label>
                    <textarea
                      className="min-h-[90px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={editNotes}
                      onChange={(event) => setEditNotes(event.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button onClick={handleUpdateCurrentContract} disabled={busyAction !== null}>
                      {busyAction === 'update' ? 'Salvando...' : 'Salvar alteração'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 text-base font-semibold text-gray-900">Histórico de contratos</h3>
              {historyContracts.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum vínculo contratual registrado para este aluno.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted text-left text-xs uppercase text-gray-600">
                        <th className="px-2 py-2">Contrato</th>
                        <th className="px-2 py-2">Período</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Valor</th>
                        <th className="px-2 py-2">Motivo de cancelamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyContracts.map((item) => (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="px-2 py-2 font-medium text-gray-900">{item.contract.title}</td>
                          <td className="px-2 py-2 text-gray-700">
                            {formatDateLabel(item.startDate) || 'Sem início'}
                            {' - '}
                            {formatDateLabel(item.endDate) || 'Em aberto'}
                          </td>
                          <td className="px-2 py-2 text-gray-700">
                            {studentContractStatusLabel[item.status] || item.status}
                          </td>
                          <td className="px-2 py-2 text-gray-700">
                            {formatCurrency(item.amount ?? item.service?.monthlyPrice)
                              ? `R$ ${formatCurrency(item.amount ?? item.service?.monthlyPrice)}`
                              : 'Não informado'}
                          </td>
                          <td className="px-2 py-2 text-gray-700">{item.cancellationReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 text-base font-semibold text-gray-900">Área de ações</h3>
              {!canManageContracts && !canCancelContracts && !canRenewContracts ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-muted-foreground">
                  Você possui permissão de visualização. As ações de vínculo e gestão contratual exigem perfil financeiro/gestão.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {canManageContracts && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 text-sm font-semibold text-gray-900">Vincular novo contrato</div>
                      <select
                        className="h-10 w-full rounded-md border border-input px-3 text-sm"
                        value={selectedAvailableContractId}
                        onChange={(event) => setSelectedAvailableContractId(event.target.value)}
                      >
                        <option value="">Selecione um contrato</option>
                        {availableContracts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} • {item.service?.name || 'Sem serviço'}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <Input
                          type="date"
                          label="Data de início"
                          value={startDateInput}
                          onChange={(event) => setStartDateInput(event.target.value)}
                        />
                        <Input
                          label="Dia de pagamento"
                          value={paymentDayInput}
                          onChange={(event) => setPaymentDayInput(event.target.value)}
                          placeholder="1 a 31"
                        />
                      </div>
                      <div className="mt-2">
                        <label className="mb-2 block text-sm font-medium text-foreground">Observações financeiras/contratuais</label>
                        <textarea
                          className="min-h-[70px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          value={notesInput}
                          onChange={(event) => setNotesInput(event.target.value)}
                        />
                      </div>
                      {selectedAvailableContract && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Serviço: {selectedAvailableContract.service?.name || 'Não informado'} • Status: {selectedAvailableContract.status}
                        </p>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button onClick={handleLinkContract} disabled={busyAction !== null || !selectedAvailableContractId}>
                          {busyAction === 'link' ? 'Vinculando...' : 'Vincular novo contrato'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {canManageContracts && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 text-sm font-semibold text-gray-900">Ativar contrato</div>
                      <select
                        className="h-10 w-full rounded-md border border-input px-3 text-sm"
                        value={selectedHistoryContractId}
                        onChange={(event) => setSelectedHistoryContractId(event.target.value)}
                      >
                        <option value="">Selecione do histórico</option>
                        {historyContracts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.contract.title} • {studentContractStatusLabel[item.status] || item.status}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3 flex justify-end">
                        <Button onClick={handleActivateContract} disabled={busyAction !== null || !selectedHistoryContractId}>
                          {busyAction === 'activate' ? 'Ativando...' : 'Ativar contrato'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {canCancelContracts && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 text-sm font-semibold text-gray-900">Cancelar contrato</div>
                      <Input
                        label="Motivo do cancelamento"
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder="Motivo obrigatório"
                      />
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          onClick={handleCancelContract}
                          disabled={busyAction !== null || !currentContract || cancelReason.trim().length < 3}
                        >
                          {busyAction === 'cancel' ? 'Cancelando...' : 'Cancelar contrato'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {canRenewContracts && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 text-sm font-semibold text-gray-900">Renovar contrato</div>
                      <select
                        className="h-10 w-full rounded-md border border-input px-3 text-sm"
                        value={renewContractId}
                        onChange={(event) => setRenewContractId(event.target.value)}
                      >
                        <option value="">Selecione um contrato para renovar</option>
                        {availableContracts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} • {item.service?.name || 'Sem serviço'}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3 flex justify-end">
                        <Button onClick={handleRenewContract} disabled={busyAction !== null || !renewContractId}>
                          {busyAction === 'renew' ? 'Renovando...' : 'Renovar contrato'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-muted-foreground">Serviço vigente</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {activeContractService || 'Não informado'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-muted-foreground">Condição especial</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {segmentedFinancialProfile?.specialCondition || financialInfo.specialCondition || 'Não informada'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-muted-foreground">Valor mensal informado</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {formatCurrency(activeContractAmount) ? `R$ ${formatCurrency(activeContractAmount)}` : 'Não informado'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-muted-foreground">Professor responsável</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {financialInfo.responsibleProfessorName || aluno.professor?.user?.profile?.name || 'Não informado'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-muted-foreground">Dia de pagamento informado</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {activePaymentDay || 'Não informado'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-muted-foreground">Contrato informado</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {activeContractLabel}
            </div>
            {activeContractService && (
              <div className="mt-1 text-xs text-muted-foreground">Serviço: {activeContractService}</div>
            )}
            {activeContractAmount !== null && activeContractAmount !== undefined && (
              <div className="mt-1 text-xs text-muted-foreground">
                Valor: R$ {formatCurrency(activeContractAmount)}
              </div>
            )}
            {activeContractStartDate && (
              <div className="mt-1 text-xs text-muted-foreground">
                Vigência: {formatDateLabel(activeContractStartDate)}
                {activeContractEndDate ? ` até ${formatDateLabel(activeContractEndDate)}` : ''}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Outras observações</div>
          <div className="mt-1 text-sm text-gray-900">{activeNotes || 'Não informadas'}</div>
        </div>
      </CardContent>
    </Card>
  );
}
