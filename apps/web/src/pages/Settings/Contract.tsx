import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ImagePlus, MapPin, Upload, X } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { contractService } from '../../services/contract.service';
import api from '../../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { commonCopy, contractCopy, professoresCopy } from '../../i18n/ptBR';
import type { Contract } from '../../services/contract.service';

const contractSchema = z.object({
  name: z.string().trim().min(1, contractCopy.companyNameRequired),
  tradeName: z.string().optional(),
  document: z.string().refine((value) => value.replace(/\D/g, '').length === 14, contractCopy.invalidDocument),
  cref: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressNeighborhood: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressComplement: z.string().optional(),
  addressZipCode: z.string().optional(),
  logoUrl: z.string().optional(),
});

type ContractForm = z.infer<typeof contractSchema>;

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatZipCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function resolveLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) {
    return '';
  }

  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return logoUrl;
  }

  return logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return <Input label={label} value={value || contractCopy.notInformed} readOnly disabled />;
}

export default function ContractSettings() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      name: '',
      tradeName: '',
      document: '',
      cref: '',
      addressStreet: '',
      addressNumber: '',
      addressNeighborhood: '',
      addressCity: '',
      addressState: '',
      addressComplement: '',
      addressZipCode: '',
      logoUrl: '',
    },
  });

  const canEdit = user?.type === 'professor' && user?.professor?.role === 'master';
  const logoUrl = watch('logoUrl');
  const resolvedLogoUrl = resolveLogoUrl(logoUrl || user?.professor?.contract?.logoUrl || '');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const applyContract = (contract: Contract | NonNullable<NonNullable<typeof user>['professor']>['contract']) => {
          reset({
            name: contract?.name || '',
            tradeName: contract?.tradeName || '',
            document: formatCnpj(contract?.document || ''),
            cref: contract?.cref || '',
            addressStreet: contract?.addressStreet || '',
            addressNumber: contract?.addressNumber || '',
            addressNeighborhood: contract?.addressNeighborhood || '',
            addressCity: contract?.addressCity || '',
            addressState: contract?.addressState || '',
            addressComplement: contract?.addressComplement || '',
            addressZipCode: contract?.addressZipCode || '',
            logoUrl: contract?.logoUrl || '',
          });
        };

        if (!canEdit) {
          const contract = user?.professor?.contract;
          if (contract) {
            applyContract(contract);
          }
          setLoading(false);
          return;
        }

        const contract = await contractService.getMe();
        applyContract(contract);
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
      if (normalized.length !== 14) {
        setError('document', {
          message: contractCopy.invalidCnpj,
        });
        setSaving(false);
        return;
      }
      const updated = await contractService.updateMe({
        name: data.name.trim(),
        tradeName: data.tradeName?.trim() || null,
        document: data.document,
        cref: data.cref?.trim() || null,
        addressStreet: data.addressStreet?.trim() || null,
        addressNumber: data.addressNumber?.trim() || null,
        addressNeighborhood: data.addressNeighborhood?.trim() || null,
        addressCity: data.addressCity?.trim() || null,
        addressState: data.addressState?.trim() || null,
        addressComplement: data.addressComplement?.trim() || null,
        addressZipCode: data.addressZipCode?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
      });
      reset({
        name: updated.name || '',
        tradeName: updated.tradeName || '',
        document: formatCnpj(updated.document),
        cref: updated.cref || '',
        addressStreet: updated.addressStreet || '',
        addressNumber: updated.addressNumber || '',
        addressNeighborhood: updated.addressNeighborhood || '',
        addressCity: updated.addressCity || '',
        addressState: updated.addressState || '',
        addressComplement: updated.addressComplement || '',
        addressZipCode: updated.addressZipCode || '',
        logoUrl: updated.logoUrl || '',
      });
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || contractCopy.updateError);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !canEdit) {
      return;
    }

    setUploadingLogo(true);
    setErrorMessage(null);
    try {
      const uploadedUrl = await contractService.uploadLogo(file);
      setValue('logoUrl', uploadedUrl, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || contractCopy.uploadError);
    } finally {
      setUploadingLogo(false);
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
        <CardContent className="space-y-6">
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
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{contractCopy.logoTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{contractCopy.logoDescription}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card">
                  {resolvedLogoUrl ? (
                    <img src={resolvedLogoUrl} alt={contractCopy.contractName} className="h-full w-full object-contain p-2" />
                  ) : (
                    <ImagePlus size={28} className="text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {resolvedLogoUrl ? contractCopy.logoReplace : contractCopy.logoEmpty}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{contractCopy.logoHint}</p>
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label={contractCopy.logoTitle}
                    title={contractCopy.logoTitle}
                    onChange={handleLogoUpload}
                  />
                  <input type="hidden" {...register('logoUrl')} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    isLoading={uploadingLogo}
                  >
                    <Upload size={16} className="mr-2" />
                    {resolvedLogoUrl ? contractCopy.logoReplace : contractCopy.logoUpload}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setValue('logoUrl', '', { shouldDirty: true, shouldValidate: true })}
                    disabled={!logoUrl || uploadingLogo}
                  >
                    <X size={16} className="mr-2" />
                    {contractCopy.logoRemove}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                {canEdit ? (
                  <Input
                    label={contractCopy.contractName}
                    placeholder="Empresa Exemplo Ltda"
                    error={errors.name?.message}
                    {...register('name')}
                  />
                ) : (
                  <ReadOnlyField
                    label={contractCopy.contractName}
                    value={user?.professor?.contract?.name}
                  />
                )}
              </div>
              <div>
                {canEdit ? (
                  <Input
                    label={contractCopy.tradeName}
                    placeholder="Empresa Exemplo"
                    error={errors.tradeName?.message}
                    {...register('tradeName')}
                  />
                ) : (
                  <ReadOnlyField label={contractCopy.tradeName} value={user?.professor?.contract?.tradeName} />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
              <div>
                {canEdit ? (
                  <Input
                    label={contractCopy.crefLabel}
                    placeholder="12345-G/SP"
                    error={errors.cref?.message}
                    {...register('cref')}
                  />
                ) : (
                  <ReadOnlyField label={contractCopy.crefLabel} value={user?.professor?.contract?.cref} />
                )}
              </div>
              <div>
                {canEdit ? (
                  <Input
                    label={contractCopy.documentLabel}
                    placeholder="00.000.000/0000-00"
                    error={errors.document?.message}
                    {...register('document', {
                      onChange: (event) => {
                        const formatted = formatCnpj(event.target.value);
                        setValue('document', formatted, { shouldValidate: true });
                      },
                    })}
                  />
                ) : (
                  <ReadOnlyField
                    label={contractCopy.documentLabel}
                    value={formatCnpj(user?.professor?.contract?.document || '')}
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MapPin size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{contractCopy.addressTitle}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{contractCopy.addressDescription}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {canEdit ? (
                  <Input
                    label={professoresCopy.addressStreetLabel}
                    placeholder="Rua Exemplo"
                    error={errors.addressStreet?.message}
                    {...register('addressStreet')}
                  />
                ) : (
                  <ReadOnlyField label={professoresCopy.addressStreetLabel} value={user?.professor?.contract?.addressStreet} />
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[140px_180px]">
                {canEdit ? (
                  <>
                    <Input
                      label={professoresCopy.addressNumberLabel}
                      placeholder="123"
                      error={errors.addressNumber?.message}
                      {...register('addressNumber')}
                    />
                    <Input
                      label={professoresCopy.addressZipCodeLabel}
                      placeholder="00000-000"
                      error={errors.addressZipCode?.message}
                      {...register('addressZipCode', {
                        onChange: (event) => {
                          setValue('addressZipCode', formatZipCode(event.target.value), {
                            shouldValidate: true,
                          });
                        },
                      })}
                    />
                  </>
                ) : (
                  <>
                    <ReadOnlyField label={professoresCopy.addressNumberLabel} value={user?.professor?.contract?.addressNumber} />
                    <ReadOnlyField label={professoresCopy.addressZipCodeLabel} value={user?.professor?.contract?.addressZipCode} />
                  </>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_120px]">
                {canEdit ? (
                  <>
                    <Input
                      label={professoresCopy.addressNeighborhoodLabel}
                      placeholder="Centro"
                      error={errors.addressNeighborhood?.message}
                      {...register('addressNeighborhood')}
                    />
                    <Input
                      label={professoresCopy.addressCityLabel}
                      placeholder="São Paulo"
                      error={errors.addressCity?.message}
                      {...register('addressCity')}
                    />
                    <Input
                      label={professoresCopy.addressStateLabel}
                      placeholder="SP"
                      error={errors.addressState?.message}
                      {...register('addressState')}
                    />
                  </>
                ) : (
                  <>
                    <ReadOnlyField label={professoresCopy.addressNeighborhoodLabel} value={user?.professor?.contract?.addressNeighborhood} />
                    <ReadOnlyField label={professoresCopy.addressCityLabel} value={user?.professor?.contract?.addressCity} />
                    <ReadOnlyField label={professoresCopy.addressStateLabel} value={user?.professor?.contract?.addressState} />
                  </>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)]">
                {canEdit ? (
                  <Input
                    label={professoresCopy.addressComplementLabel}
                    placeholder="Sala 4, bloco B"
                    error={errors.addressComplement?.message}
                    {...register('addressComplement')}
                  />
                ) : (
                  <ReadOnlyField label={professoresCopy.addressComplementLabel} value={user?.professor?.contract?.addressComplement} />
                )}
              </div>
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" isLoading={saving}>
                  {commonCopy.save}
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

