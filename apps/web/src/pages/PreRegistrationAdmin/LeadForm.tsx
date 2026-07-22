import { useState, type FormEvent, type ReactNode } from 'react';
import type { PreRegistrationAdminProfessorDTO } from '@corrida/types';
import { ArrowLeft, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  cpf: string;
  origin: string;
  responsibleProfessorId: string;
  commercialNotes: string;
  unit: string;
}

const EMPTY_VALUES: LeadFormValues = {
  name: '',
  phone: '',
  email: '',
  cpf: '',
  origin: '',
  responsibleProfessorId: '',
  commercialNotes: '',
  unit: '',
};

export function LeadForm({
  title,
  description,
  initialValues,
  responsibleProfessors,
  submitLabel,
  submitting,
  error,
  children,
  onSubmit,
}: {
  title: string;
  description: string;
  initialValues?: Partial<LeadFormValues>;
  responsibleProfessors: PreRegistrationAdminProfessorDTO[];
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  children?: ReactNode;
  onSubmit: (values: LeadFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<LeadFormValues>({ ...EMPTY_VALUES, ...initialValues });

  const update = (field: keyof LeadFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Gestão comercial</p>
          <h1 className="ts-page-heading">{title}</h1>
          <p className="ts-page-description">{description}</p>
        </div>
        <Link to="/pre-matriculas">
          <Button type="button" variant="outline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar à lista
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identificação e contato</CardTitle>
          <CardDescription>
            Informe o mínimo necessário para iniciar o relacionamento. O preenchimento clínico continua restrito ao fluxo de pré-cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Nome completo *</span>
            <Input value={values.name} onChange={(event) => update('name', event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Telefone</span>
            <Input value={values.phone} onChange={(event) => update('phone', event.target.value)} placeholder="(15) 99999-9999" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">E-mail</span>
            <Input type="email" value={values.email} onChange={(event) => update('email', event.target.value)} placeholder="nome@exemplo.com" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">CPF</span>
            <Input value={values.cpf} onChange={(event) => update('cpf', event.target.value)} placeholder="000.000.000-00" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Origem *</span>
            <Input value={values.origin} onChange={(event) => update('origin', event.target.value)} placeholder="Indicação, campanha, recepção..." required />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acompanhamento comercial</CardTitle>
          <CardDescription>
            Estes dados apoiam a operação e não alteram respostas de saúde, anamnese ou PAR-Q.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Responsável</span>
            <select
              className="ts-form-control"
              value={values.responsibleProfessorId}
              onChange={(event) => update('responsibleProfessorId', event.target.value)}
            >
              <option value="">Usar responsável atual</option>
              {responsibleProfessors.map((professor) => (
                <option key={professor.id} value={professor.id}>{professor.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Unidade</span>
            <Input value={values.unit} onChange={(event) => update('unit', event.target.value)} placeholder="Unidade ou local de atendimento" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Observações comerciais</span>
            <textarea
              className="ts-form-control min-h-28 resize-y"
              value={values.commercialNotes}
              onChange={(event) => update('commercialNotes', event.target.value)}
              placeholder="Registre contexto de contato, interesse e próximos combinados."
            />
          </label>
        </CardContent>
      </Card>

      {children}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" isLoading={submitting} loadingText="Salvando...">
          <Save className="h-4 w-4" aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
