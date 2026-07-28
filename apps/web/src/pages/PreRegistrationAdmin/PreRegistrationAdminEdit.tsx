import { useEffect, useState } from 'react';
import type {
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationAdminProfessorDTO,
  PreRegistrationLeadDuplicateCheckDTO,
} from '@corrida/types';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import { LeadForm, type LeadFormValues } from './LeadForm';

function errorMessage(error: unknown) {
  const value = error as { response?: { data?: { error?: string } }; message?: string };
  return value.response?.data?.error || value.message || 'Não foi possível salvar as alterações.';
}

export function PreRegistrationAdminEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<PreRegistrationAdminLeadDetailDTO | null>(null);
  const [responsibles, setResponsibles] = useState<PreRegistrationAdminProfessorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] =
    useState<PreRegistrationLeadDuplicateCheckDTO | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState('');

  useEffect(() => {
    Promise.all([
      preRegistrationAdminService.get(id),
      preRegistrationAdminService.list({ page: 1, pageSize: 1 }),
    ])
      .then(([detail, list]) => {
        setLead(detail);
        setResponsibles(list.filterOptions.responsibleProfessors);
      })
      .catch((loadError) => setError(errorMessage(loadError)))
      .finally(() => setLoading(false));
  }, [id]);

  const submit = async (values: LeadFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const duplicateResult = await preRegistrationAdminService.checkUpdateDuplicates(id, values);
      setDuplicates(duplicateResult);
      if (
        duplicateResult.hasBlockingCpfConflict ||
        duplicateResult.classification === 'BLOCKING'
      ) {
        setError('A alteração cria um conflito bloqueante de identidade.');
        return;
      }
      if (
        duplicateResult.classification === 'REVIEW_REQUIRED' &&
        duplicateResult.restrictedCandidateCount > 0
      ) {
        setConfirmDuplicate(false);
        setError(
          'A decisão deve ser concluída por um usuário com acesso a todos os cadastros relacionados.'
        );
        return;
      }
      if (
        duplicateResult.classification === 'REVIEW_REQUIRED' &&
        (!confirmDuplicate || !duplicateReason.trim())
      ) {
        setError(
          confirmDuplicate
            ? 'Informe o motivo para confirmar que se trata de uma pessoa diferente.'
            : 'Revise os possíveis cadastros semelhantes e confirme antes de salvar.'
        );
        return;
      }

      await preRegistrationAdminService.update(id, {
        name: values.name,
        phone: values.phone || undefined,
        additionalPhone: values.additionalPhone || undefined,
        email: values.email || undefined,
        additionalEmail: values.additionalEmail || undefined,
        cpf: values.cpf || undefined,
        origin: values.origin,
        responsibleProfessorId: values.responsibleProfessorId || null,
        commercialNotes: values.commercialNotes || null,
        unit: values.unit || null,
        ...(duplicateResult.classification === 'REVIEW_REQUIRED'
          ? {
              expectedDuplicateVersion: duplicateResult.recordVersion,
              confirmedDuplicateFingerprint: duplicateResult.fingerprint,
              confirmedDuplicateReason: duplicateReason.trim(),
            }
          : {}),
      });
      navigate(`/pre-matriculas/${id}`);
    } catch (submissionError) {
      setError(errorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /><p className="mt-4 text-sm text-muted-foreground">Carregando dados comerciais...</p></div>;
  }

  if (!lead) {
    return <Card><CardContent className="py-12 text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-3 text-lg font-semibold">Não foi possível editar</h1><p className="mt-1 text-sm text-muted-foreground">{error || 'O registro não está disponível no seu escopo.'}</p></CardContent></Card>;
  }

  return (
    <LeadForm
      title={`Editar ${lead.name}`}
      description="Atualize somente informações administrativas e comerciais. Dados clínicos permanecem fora deste fluxo."
      initialValues={{
        name: lead.name,
        phone: lead.contacts.phone || '',
        additionalPhone: lead.contacts.additionalPhone || '',
        email: lead.contacts.email || '',
        additionalEmail: lead.contacts.additionalEmail || '',
        cpf: lead.contacts.cpf || '',
        origin: lead.origin,
        responsibleProfessorId: lead.responsible?.id || '',
        commercialNotes: lead.commercial.notes || '',
        unit: lead.commercial.unit || '',
      }}
      responsibleProfessors={responsibles}
      submitLabel="Salvar alterações"
      submitting={submitting}
      error={error}
      onIdentityChange={() => {
        setDuplicates(null);
        setConfirmDuplicate(false);
        setDuplicateReason('');
      }}
      onSubmit={submit}
    >
      {duplicates?.classification === 'REVIEW_REQUIRED' && (
        <Card className="border-warning/40">
          <CardContent className="space-y-4 py-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Revisão de duplicidade necessária</h2>
                <p className="text-sm text-muted-foreground">
                  Confira os sinais mascarados. A confirmação ficará vinculada à versão atual
                  e será auditada junto com a alteração.
                </p>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {duplicates.candidates.map((candidate) => (
                <li key={candidate.candidateAlunoId} className="rounded-md border border-border p-3">
                  <p className="font-medium">{candidate.maskedName}</p>
                  <p className="text-xs text-muted-foreground">
                    {candidate.signals.map((signal) => signal.label).join(' • ')}
                  </p>
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={confirmDuplicate}
                onChange={(event) => setConfirmDuplicate(event.target.checked)}
              />
              <span>Confirmo que os cadastros representam pessoas diferentes.</span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Motivo da decisão *</span>
              <Input
                value={duplicateReason}
                onChange={(event) => setDuplicateReason(event.target.value)}
                placeholder="Explique por que o contato compartilhado é válido"
              />
            </label>
          </CardContent>
        </Card>
      )}
    </LeadForm>
  );
}
