import { useState, type FormEvent, type ReactNode } from 'react';
import type { PreRegistrationAdminProfessorDTO } from '@corrida/types';
import { ArrowLeft, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import {
  EMPTY_LEAD_FORM_VALUES,
  formatLeadFieldValue,
  normalizeLeadFieldOnBlur,
  normalizeLeadFormValues,
  validateLeadFormValues,
  type LeadFormErrors,
  type LeadFormValues,
} from './lead-form.validation';

export type { LeadFormValues } from './lead-form.validation';

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
  onIdentityChange,
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
  onIdentityChange?: () => void;
}) {
  const [values, setValues] = useState<LeadFormValues>(() =>
    normalizeLeadFormValues({ ...EMPTY_LEAD_FORM_VALUES, ...initialValues })
  );
  const [fieldErrors, setFieldErrors] = useState<LeadFormErrors>({});

  const update = (field: keyof LeadFormValues, rawValue: string) => {
    const value = formatLeadFieldValue(field, rawValue);
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (['name', 'phone', 'additionalPhone', 'email', 'additionalEmail', 'cpf'].includes(field)) {
      onIdentityChange?.();
    }
  };

  const normalizeField = (field: keyof LeadFormValues) => {
    setValues((current) => ({
      ...current,
      [field]: normalizeLeadFieldOnBlur(field, current[field]),
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedValues = normalizeLeadFormValues(values);
    const validationErrors = validateLeadFormValues(normalizedValues);
    setValues(normalizedValues);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    await onSubmit(normalizedValues);
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
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
          <div className="md:col-span-2">
            <Input
              label="Nome completo"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              onBlur={() => normalizeField('name')}
              autoComplete="name"
              required
              error={fieldErrors.name}
            />
          </div>
          <Input
            label="Telefone"
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            onBlur={() => normalizeField('phone')}
            placeholder="(15) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            error={fieldErrors.phone}
          />
          <Input
            label="Telefone adicional"
            value={values.additionalPhone}
            onChange={(event) => update('additionalPhone', event.target.value)}
            onBlur={() => normalizeField('additionalPhone')}
            placeholder="(15) 99999-9999"
            inputMode="tel"
            maxLength={16}
            error={fieldErrors.additionalPhone}
          />
          <Input
            label="E-mail"
            type="email"
            value={values.email}
            onChange={(event) => update('email', event.target.value)}
            onBlur={() => normalizeField('email')}
            placeholder="nome@exemplo.com"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            error={fieldErrors.email}
          />
          <Input
            label="E-mail adicional"
            type="email"
            value={values.additionalEmail}
            onChange={(event) => update('additionalEmail', event.target.value)}
            onBlur={() => normalizeField('additionalEmail')}
            placeholder="outro@exemplo.com"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            error={fieldErrors.additionalEmail}
          />
          <Input
            label="CPF"
            value={values.cpf}
            onChange={(event) => update('cpf', event.target.value)}
            onBlur={() => normalizeField('cpf')}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
            error={fieldErrors.cpf}
          />
          <Input
            label="Origem"
            value={values.origin}
            onChange={(event) => update('origin', event.target.value)}
            onBlur={() => normalizeField('origin')}
            placeholder="Indicação, campanha, recepção..."
            required
            error={fieldErrors.origin}
          />
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
          <Input
            label="Unidade"
            value={values.unit}
            onChange={(event) => update('unit', event.target.value)}
            onBlur={() => normalizeField('unit')}
            placeholder="Unidade ou local de atendimento"
          />
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Observações comerciais</span>
            <textarea
              className="ts-form-control min-h-28 resize-y"
              value={values.commercialNotes}
              onChange={(event) => update('commercialNotes', event.target.value)}
              onBlur={() => normalizeField('commercialNotes')}
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
        <Button type="submit" isLoading={submitting} loadingText="Salvando..." disabled={submitting}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
