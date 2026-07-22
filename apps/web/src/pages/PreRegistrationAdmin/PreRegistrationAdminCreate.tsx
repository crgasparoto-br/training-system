import { useEffect, useState } from 'react';
import type { PreRegistrationDuplicateCheckResultDTO } from '@corrida/types';
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
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { LeadForm, type LeadFormValues } from './LeadForm';

function errorMessage(error: unknown) {
  const value = error as { response?: { data?: { error?: string } }; message?: string };
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
    useState<PreRegistrationDuplicateCheckResultDTO | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
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
      if (duplicateResult.hasBlockingCpfConflict) {
        setDuplicates(duplicateResult);
        setError(
          'Já existe um cadastro com este CPF. Abra o registro existente antes de continuar.'
        );
        return;
      }
      if (duplicateResult.candidates.length > 0 && !confirmDuplicate) {
        setDuplicates(duplicateResult);
        setError('Revise os possíveis cadastros semelhantes e confirme antes de continuar.');
        return;
      }

      const lead = await preRegistrationAdminService.create({
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        cpf: values.cpf || undefined,
        origin: values.origin,
        responsibleProfessorId: values.responsibleProfessorId || undefined,
        commercialNotes: values.commercialNotes || undefined,
        unit: values.unit || undefined,
        confirmPossibleDuplicate: confirmDuplicate,
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
      setError(errorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LeadForm
      title="Novo lead"
      description="Cadastre o contato inicial, verifique possíveis duplicidades e, quando permitido, gere o convite imediatamente."
      responsibleProfessors={responsibles}
      submitLabel="Criar lead"
      submitting={submitting}
      error={error}
      onSubmit={submit}
    >
      {duplicates?.candidates.length ? (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              Possíveis cadastros semelhantes
            </CardTitle>
            <CardDescription>
              A verificação considera todo o contrato. Registros fora do seu escopo aparecem
              sem identificação para preservar a privacidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicates.candidates.map((candidate, index) => (
              <div
                key={candidate.alunoId || `${candidate.matchingFields.join('-')}-${index}`}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <p className="font-medium text-foreground">{candidate.name}</p>
                <p className="text-muted-foreground">
                  Correspondência: {candidate.matchingFields.join(', ')}
                </p>
                {candidate.accessible && candidate.alunoId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate(`/pre-matriculas/${candidate.alunoId}`)}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Abrir cadastro existente
                  </Button>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    O cadastro existe no contrato, mas não pertence ao seu escopo de consulta.
                  </p>
                )}
              </div>
            ))}
            {!duplicates.hasBlockingCpfConflict && (
              <label className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={confirmDuplicate}
                  onChange={(event) => setConfirmDuplicate(event.target.checked)}
                />
                <span>Revisei os registros semelhantes e confirmo que esta é uma nova pessoa.</span>
              </label>
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
