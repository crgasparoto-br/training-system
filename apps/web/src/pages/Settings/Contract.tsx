import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../stores/useAuthStore';
import { contractService } from '../../services/contract.service';
import api from '../../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { commonCopy, contractCopy } from '../../i18n/ptBR';

const contractSchema = z.object({
  name: z.string().optional(),
  document: z.string().min(11, contractCopy.invalidDocument),
});

type ContractForm = z.infer<typeof contractSchema>;

export default function ContractSettings() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contractType, setContractType] = useState<'academy' | 'personal'>('personal');

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
  });

  const canEdit = user?.type === 'professor' && user?.professor?.role === 'master';
  const formatDocument = (value: string, type: 'academy' | 'personal' = contractType) => {
    const digits = value.replace(/\D/g, '');
    if (type === 'academy') {
      const limited = digits.slice(0, 14);
      return limited
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    const limited = digits.slice(0, 11);
    return limited
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        if (!canEdit) {
          const contract = user?.professor?.contract;
          if (contract) {
            setContractType(contract.type);
            reset({
              name: contract.name || '',
              document: formatDocument(contract.document, contract.type),
            });
          }
          setLoading(false);
          return;
        }

        const contract = await contractService.getMe();
        setContractType(contract.type);
        reset({
          name: contract.name || '',
          document: formatDocument(contract.document, contract.type),
        });
      } catch (err: any) {
        setErrorMessage(err.response?.data?.error || contractCopy.loadError);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [canEdit, reset, user]);

  const onSubmit = async (data: ContractForm) => {
    if (!canEdit) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const normalized = data.document.replace(/\D/g, '');
      const expected = contractType === 'academy' ? 14 : 11;
      if (normalized.length !== expected) {
        setError('document', {
          message: contractType === 'academy' ? contractCopy.invalidCnpj : contractCopy.invalidCpf,
        });
        setSaving(false);
        return;
      }
      const updated = await contractService.updateMe({
        name: data.name?.trim() || undefined,
        document: data.document,
      });
      reset({
        name: updated.name || '',
        document: formatDocument(updated.document, updated.type),
      });
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || contractCopy.updateError);
    } finally {
      setSaving(false);
    }
  };

  const handleCloneData = async () => {
    if (!canEdit) return;
    if (!confirm(contractCopy.cloneConfirm)) {
      return;
    }

    setCloning(true);
    setCloneResult(null);
    setErrorMessage(null);
    try {
      const response = await api.post('/contracts/clone-data', {
        copyParameters: true,
        copyExercises: true,
        copyAssessmentTypes: true,
      });

      const result = response.data?.data;
      setCloneResult(
        `Parâmetros: +${result.parametersCreated} (ignorado ${result.parametersSkipped}) | Exercícios: +${result.exercisesCreated} (ignorado ${result.exercisesSkipped}) | Avaliações: +${result.assessmentTypesCreated} (ignorado ${result.assessmentTypesSkipped})`
      );
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || contractCopy.cloneError);
    } finally {
      setCloning(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">{commonCopy.loading}</div>;
  }

  const documentLabel = contractType === 'academy' ? 'CNPJ' : 'CPF';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{contractCopy.title}</h1>
        <p className="text-sm text-muted-foreground">
          {contractCopy.description}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{contractCopy.infoTitle}</CardTitle>
          <CardDescription>{contractCopy.infoDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 mb-4">
              {errorMessage}
            </div>
          )}
          {!canEdit && (
            <div className="text-sm text-muted-foreground mb-4">
              {contractCopy.masterOnly}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {canEdit ? (
              <Input
                label={contractCopy.contractName}
                placeholder="Academia Exemplo"
                error={errors.name?.message}
                {...register('name')}
              />
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {contractCopy.contractName}
                </label>
                <div className="h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {user?.professor?.contract?.name || contractCopy.notInformed}
                </div>
              </div>
            )}
            {canEdit ? (
              <Input
                label={documentLabel}
                placeholder={
                  documentLabel === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'
                }
                error={errors.document?.message}
                {...register('document', {
                  onChange: (event) => {
                    const formatted = formatDocument(event.target.value);
                    setValue('document', formatted, { shouldValidate: true });
                  },
                })}
              />
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {documentLabel}
                </label>
                <div className="h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {formatDocument(
                    user?.professor?.contract?.document || ''
                  )}
                </div>
              </div>
            )}
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" isLoading={saving}>
                  Salvar
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{contractCopy.cloneTitle}</CardTitle>
          <CardDescription>
              {contractCopy.cloneDescription}
          </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cloneResult && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
                {cloneResult}
              </div>
            )}
            <Button variant="outline" onClick={handleCloneData} isLoading={cloning}>
              {contractCopy.cloneButton}
            </Button>
            <p className="text-xs text-muted-foreground">
              {contractCopy.cloneIgnoreHint}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

