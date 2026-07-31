import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ShieldCheck, UserRoundCheck } from 'lucide-react';
import type { AdipometryGovernanceResponse } from '@corrida/types';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { adipometryGovernanceService } from '../../../services/adipometry-governance.service';

const APPROVAL_STATEMENT =
  'Declaro que revisei e aprovo esta versão clínica para uso no contrato, conforme a referência, regras, limites e vetores identificados pelo hash apresentado.';

function statusLabel(status: 'DRAFT' | 'APPROVED' | 'DISABLED') {
  if (status === 'APPROVED') return 'Aprovado no contrato';
  if (status === 'DISABLED') return 'Indisponível';
  return 'Aguardando aprovação';
}

interface Props {
  canManage: boolean;
}

export function AdipometryTechnicalResponsibilityCard({ canManage }: Props) {
  const [governance, setGovernance] = useState<AdipometryGovernanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [selectedProfessorId, setSelectedProfessorId] = useState('');
  const [endReason, setEndReason] = useState('');
  const [revocationReason, setRevocationReason] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await adipometryGovernanceService.get();
      setGovernance(data);
      setSelectedProfessorId(data.currentResponsibility?.professorId || '');
    } catch (error: any) {
      setErrorMessage(
        error.response?.data?.error ||
          'Não foi possível carregar a responsabilidade técnica da adipometria.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProtocol = useMemo(
    () => governance?.protocols.find((protocol) => protocol.code === 'GUEDES_1991_ADULT_YOUNG'),
    [governance]
  );

  const replacingCurrent = Boolean(
    governance?.currentResponsibility &&
      selectedProfessorId &&
      governance.currentResponsibility.professorId !== selectedProfessorId
  );
  const canManageResponsibility = governance?.canManageResponsibility ?? canManage;
  const activeApproval = selectedProtocol?.approval?.active ? selectedProtocol.approval : null;
  const revokedApproval = selectedProtocol?.approval && !selectedProtocol.approval.active
    ? selectedProtocol.approval
    : null;

  const handleDesignation = async () => {
    if (!selectedProfessorId) {
      setErrorMessage('Selecione o profissional responsável.');
      return;
    }
    if (replacingCurrent && !endReason.trim()) {
      setErrorMessage('Informe o motivo da troca para preservar o histórico da designação.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = await adipometryGovernanceService.designate({
        professorId: selectedProfessorId,
        endReason: replacingCurrent ? endReason.trim() : undefined,
      });
      setGovernance(data);
      setEndReason('');
      setSuccessMessage('Responsável técnico atualizado com histórico preservado.');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.error || 'Não foi possível atualizar o responsável técnico.');
    } finally {
      setSaving(false);
    }
  };

  const handleApproval = async () => {
    if (!selectedProtocol || !approvalConfirmed) return;

    setApproving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = await adipometryGovernanceService.approve(
        selectedProtocol.code,
        selectedProtocol.version,
        {
          approvalStatement: APPROVAL_STATEMENT,
          approvedSpecificationHash: selectedProtocol.specificationHash,
        }
      );
      setGovernance(data);
      setApprovalConfirmed(false);
      setSuccessMessage('Versão clínica aprovada para este contrato.');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.error || 'Não foi possível aprovar a versão clínica.');
    } finally {
      setApproving(false);
    }
  };

  const handleRevocation = async () => {
    if (!selectedProtocol || revocationReason.trim().length < 10) {
      setErrorMessage('Informe um motivo de revogação com pelo menos 10 caracteres.');
      return;
    }

    setRevoking(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = await adipometryGovernanceService.revoke(
        selectedProtocol.code,
        selectedProtocol.version,
        { reason: revocationReason.trim() }
      );
      setGovernance(data);
      setRevocationReason('');
      setSuccessMessage('A aprovação clínica foi revogada. Novas conclusões estão bloqueadas.');
    } catch (error: any) {
      setErrorMessage(error.response?.data?.error || 'Não foi possível revogar a aprovação clínica.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <CardTitle>Responsabilidade técnica</CardTitle>
            <CardDescription>
              Defina quem responde pelas regras clínicas da adipometria e acompanhe a aprovação de cada versão.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <p className="text-sm text-muted-foreground">Carregando responsabilidade técnica...</p>}

        {errorMessage && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {!loading && governance && (
          <>
            <section className="rounded-lg border border-border bg-muted/20 p-4" aria-labelledby="adpt-responsible-title">
              <div className="flex items-start gap-3">
                <UserRoundCheck className="mt-0.5 text-primary" size={19} />
                <div className="min-w-0 flex-1">
                  <h3 id="adpt-responsible-title" className="text-sm font-semibold text-foreground">
                    Responsável atual
                  </h3>
                  {governance.currentResponsibility ? (
                    <div className="mt-2 text-sm">
                      <p className="font-medium text-foreground">
                        {governance.currentResponsibility.professorName}
                      </p>
                      <p className="text-muted-foreground">
                        CREF {governance.currentResponsibility.professorCref} ·{' '}
                        {governance.currentResponsibility.collaboratorFunctionName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Vigente desde{' '}
                        {new Date(governance.currentResponsibility.effectiveFrom).toLocaleDateString('pt-BR')}.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nenhum responsável está configurado. Enquanto isso, protocolos não podem ser aprovados nem usados para concluir avaliações.
                    </p>
                  )}
                </div>
              </div>

              {canManageResponsibility && (
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                  <label className="text-sm font-medium text-foreground">
                    Profissional elegível
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedProfessorId}
                      onChange={(event) => {
                        setSelectedProfessorId(event.target.value);
                        setErrorMessage(null);
                      }}
                    >
                      <option value="">Selecione</option>
                      {governance.eligibleProfessionals.map((professional) => (
                        <option key={professional.professorId} value={professional.professorId}>
                          {professional.professorName} · {professional.professorCref}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Motivo da troca"
                    placeholder={replacingCurrent ? 'Ex.: alteração da responsabilidade técnica' : 'Necessário somente em uma troca'}
                    value={endReason}
                    onChange={(event) => setEndReason(event.target.value)}
                    disabled={!replacingCurrent}
                  />
                  <Button type="button" onClick={handleDesignation} isLoading={saving}>
                    {replacingCurrent ? 'Trocar responsável' : 'Designar responsável'}
                  </Button>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border p-4" aria-labelledby="adpt-protocol-title">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <BadgeCheck size={18} className="text-primary" />
                    <h3 id="adpt-protocol-title" className="text-sm font-semibold text-foreground">
                      Guedes e Guedes para adultos jovens
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    GUEDES_1991_ADULT_YOUNG · versão {selectedProtocol?.internalVersion || '1.0.0'}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {revokedApproval
                    ? 'Aprovação revogada'
                    : selectedProtocol
                      ? statusLabel(selectedProtocol.contractStatus)
                      : 'Indisponível'}
                </span>
              </div>

              {selectedProtocol && (
                <div className="mt-4 space-y-3 text-sm">
                  <p className="break-all text-xs text-muted-foreground">
                    Hash da especificação: <span className="font-mono">{selectedProtocol.specificationHash}</span>
                  </p>

                  {activeApproval && (
                    <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-3 text-green-800">
                      <p>
                        Aprovado por {activeApproval.approvedByNameSnapshot} · CREF{' '}
                        {activeApproval.approvedByCrefSnapshot} em{' '}
                        {new Date(activeApproval.approvedAt).toLocaleString('pt-BR')}.
                      </p>
                      {governance.canCurrentUserRevoke && (
                        <div className="grid gap-3 border-t border-green-200 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <Input
                            label="Motivo da revogação"
                            placeholder="Descreva por que esta aprovação não pode continuar vigente"
                            value={revocationReason}
                            onChange={(event) => setRevocationReason(event.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleRevocation}
                            disabled={revocationReason.trim().length < 10}
                            isLoading={revoking}
                          >
                            Revogar aprovação
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {revokedApproval && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <p>
                        A aprovação de {revokedApproval.approvedByNameSnapshot} foi revogada em{' '}
                        {revokedApproval.revokedAt
                          ? new Date(revokedApproval.revokedAt).toLocaleString('pt-BR')
                          : 'data não informada'}.
                      </p>
                      <p className="mt-1 text-xs">
                        Motivo: {revokedApproval.revocationReason || 'Não informado'}
                      </p>
                      <p className="mt-2 text-xs">
                        Avaliações já concluídas permanecem históricas; novas conclusões exigem uma nova aprovação.
                      </p>
                    </div>
                  )}

                  {!activeApproval && governance.canCurrentUserApprove ? (
                    <div className="rounded-md border border-border bg-muted/20 p-3">
                      <label className="flex items-start gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={approvalConfirmed}
                          onChange={(event) => setApprovalConfirmed(event.target.checked)}
                        />
                        <span>{APPROVAL_STATEMENT}</span>
                      </label>
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          onClick={handleApproval}
                          disabled={!approvalConfirmed}
                          isLoading={approving}
                        >
                          {revokedApproval ? 'Aprovar novamente' : 'Aprovar versão clínica'}
                        </Button>
                      </div>
                    </div>
                  ) : !activeApproval && !governance.canCurrentUserApprove ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                      A aprovação deve ser feita pelo próprio responsável técnico autenticado com concessão clínica explícita. A designação, sozinha, não libera cálculos nem conclusão de avaliações.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
