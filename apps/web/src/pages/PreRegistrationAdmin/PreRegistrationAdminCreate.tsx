import { useEffect, useState } from 'react';
import type { PreRegistrationLeadDuplicateCheckDTO } from '@corrida/types';
import { AlertTriangle, ExternalLink, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { canAccessBlock } from '../../access/access-control';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { LeadForm, type LeadFormValues } from './LeadForm';

type SubmissionFailure = {
  response?: {
    data?: {
      error?: string;
      code?: string;
    };
  };
  message?: string;
};

function errorMessage(error: unknown) {
  const value = error as SubmissionFailure;
  return value.response?.data?.error || value.message || 'Não foi possível criar o lead.';
}

async function copyGeneratedInvite(url: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API indisponível');
    await navigator.clipboard.writeText(url);
    return 'copied' as const;
  } catch {
    return 'failed' as const;
  }
}

export function PreRegistrationAdminCreate() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canGenerateInvite = canAccessBlock(
    user,
    'students.preRegistration.generateInvite'
  );
  const [responsibles, setResponsibles] = useState<Array<{ id: string; name: string }>>([]);
  const [duplicates, setDuplicates] =
    useState<PreRegistrationLeadDuplicateCheckDTO | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [generateInvite, setGenerateInvite] = useState(canGenerateInvite);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    preRegistrationAdminService
      .list({ page: 1, pageSize: 1 })
      .then((result) => setResponsibles(result.filterOptions.responsibleProfessors))
      .catch(() => setResponsibles([]));
  }, []);

  const submit = async (values: LeadFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      if (!values.phone.trim() && !values.email.trim()) {
        setError('Informe pelo menos telefone ou e-mail para criar o lead.');
        return;
      }

      const duplicateResult = await preRegistrationAdminService.checkDuplicates(values);
      if (duplicateResult.hasBlockingCpfConflict || duplicateResult.classification === 'BLOCKING') {
        setDuplicates(duplicateResult);
        setError(
          'Existe um cadastro incompatível com os identificadores informados. Abra o registro existente ou solicite revisão com escopo adequado.'
        );
        return;
      }
      if (
        duplicateResult.classification === 'REVIEW_REQUIRED' &&
        duplicateResult.restrictedCandidateCount > 0
      ) {
        setDuplicates(duplicateResult);
        setConfirmDuplicate(false);
        setDuplicateReason('');
        setError(
          'A decisão deve ser concluída por um usuário com acesso a todos os cadastros relacionados.'
        );
        return;
      }
      if (duplicateResult.classification === 'REVIEW_REQUIRED' && !confirmDuplicate) {
        setDuplicates(duplicateResult);
        setError('Revise os possíveis cadastros semelhantes e confirme antes de continuar.');
        return;
      }
      if (duplicateResult.classification === 'REVIEW_REQUIRED' && !duplicateReason.trim()) {
        setDuplicates(duplicateResult);
        setError('Informe o motivo para confirmar que se trata de uma nova pessoa.');
        return;
      }

      const lead = await preRegistrationAdminService.create({
        name: values.name,
        phone: values.phone || undefined,
        additionalPhone: values.additionalPhone || undefined,
        email: values.email || undefined,
        additionalEmail: values.additionalEmail || undefined,
        cpf: values.cpf || undefined,
        origin: values.origin,
        responsibleProfessorId: values.responsibleProfessorId || undefined,
        commercialNotes: values.commercialNotes || undefined,
        unit: values.unit || undefined,
        confirmedDuplicateFingerprint:
          confirmDuplicate && duplicates?.fingerprint === duplicateResult.fingerprint
            ? duplicateResult.fingerprint
            : undefined,
        confirmedDuplicateReason:
          duplicateResult.classification === 'REVIEW_REQUIRED'
            ? duplicateReason.trim()
            : undefined,
      });

      let generatedInviteUrl: string | undefined;
      let inviteCopyState: 'copied' | 'failed' | undefined;
      if (generateInvite && canGenerateInvite && lead.allowedActions.canGenerateInvite) {
        const invite = await preRegistrationAdminService.generateInvite(lead.id);
        generatedInviteUrl = invite.url;
        inviteCopyState = await copyGeneratedInvite(invite.url);
      }

      navigate(`/pre-matriculas/${lead.id}`, {
        state: generatedInviteUrl
          ? { generatedInviteUrl, inviteCopyState }
          : undefined,
      });
    } catch (submissionError) {
      const failure = submissionError as SubmissionFailure;
      if (
        failure.response?.data?.code === 'DUPLICATE_REVIEW_REQUIRED' ||
        failure.response?.data?.code === 'FORBIDDEN'
      ) {
        setConfirmDuplicate(false);
      }
      setError(errorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  };

  const showDuplicateCard = Boolean(
    duplicates &&
    (duplicates.classification !== 'NONE' || duplicates.restrictedCandidateCount > 0)
  );

  return (
    <LeadForm
      title="Novo lead"
      description="Cadastre o contato inicial, verifique possíveis duplicidades e, quando permitido, gere o convite imediatamente."
      responsibleProfessors={responsibles}
      submitLabel="Criar lead"
      submitting={submitting}
      error={error}
      onIdentityChange={() => {
        setDuplicates(null);
        setConfirmDuplicate(false);
        setDuplicateReason('');
        setError(null);
      }}
      onSubmit={submit}
    >
      {showDuplicateCard && duplicates ? (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              Possíveis cadastros semelhantes
            </CardTitle>
            <CardDescription>
              A verificação considera todo o contrato. Registros fora do seu escopo permanecem sem identificação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicates.candidates.map((candidate) => (
              <div
                key={candidate.candidateAlunoId}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <p className="font-medium text-foreground">{candidate.maskedName}</p>
                <ul className="mt-1 text-muted-foreground">
                  {candidate.signals.map((signal) => (
                    <li key={signal.code}>• {signal.label}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate(
                    candidate.status === 'ACTIVE_STUDENT'
                      ? `/central-do-aluno/${candidate.candidateAlunoId}`
                      : `/pre-matriculas/${candidate.candidateAlunoId}`
                  )}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Abrir cadastro existente
                </Button>
              </div>
            ))}
            {duplicates.restrictedCandidateCount > 0 && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                Há {duplicates.restrictedCandidateCount} cadastro(s) relacionado(s) fora do seu escopo. Nenhum dado foi exibido e esta decisão não pode ser concluída com o acesso atual.
              </p>
            )}
            {duplicates.classification === 'INFORMATIONAL' && (
              <p className="text-sm text-muted-foreground">
                A semelhança é apenas informativa e não bloqueia a criação.
              </p>
            )}
            {duplicates.classification === 'REVIEW_REQUIRED' &&
              duplicates.restrictedCandidateCount === 0 && (
                <div className="space-y-3">
                  <label className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={confirmDuplicate}
                      onChange={(event) => setConfirmDuplicate(event.target.checked)}
                    />
                    <span>Revisei os registros semelhantes e confirmo que esta é uma nova pessoa.</span>
                  </label>
                  {confirmDuplicate && (
                    <Input
                      value={duplicateReason}
                      onChange={(event) => setDuplicateReason(event.target.value)}
                      placeholder="Motivo obrigatório da decisão"
                      aria-label="Motivo para confirmar nova pessoa"
                    />
                  )}
                </div>
              )}
          </CardContent>
        </Card>
      ) : null}

      {canGenerateInvite && (
        <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-[var(--shadow-soft)]">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={generateInvite}
            onChange={(event) => setGenerateInvite(event.target.checked)}
          />
          <span>
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Gerar convite após criar
            </span>
            <span className="mt-1 block text-muted-foreground">
              O sistema tentará copiar o link automaticamente e o mostrará na ficha recém-aberta.
            </span>
          </span>
        </label>
      )}
    </LeadForm>
  );
}
