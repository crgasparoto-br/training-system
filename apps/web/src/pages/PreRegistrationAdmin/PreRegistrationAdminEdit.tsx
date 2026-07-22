import { useEffect, useState } from 'react';
import type { PreRegistrationAdminLeadDetailDTO, PreRegistrationAdminProfessorDTO } from '@corrida/types';
import { AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/Card';
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
      await preRegistrationAdminService.update(id, {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        cpf: values.cpf || undefined,
        origin: values.origin,
        responsibleProfessorId: values.responsibleProfessorId || null,
        commercialNotes: values.commercialNotes || null,
        unit: values.unit || null,
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
        email: lead.contacts.email || '',
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
      onSubmit={submit}
    />
  );
}
