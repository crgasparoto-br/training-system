import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type { Aluno, StudentSegmentedProfile } from '../../services/aluno.service';

type IdentificationInfo = {
  cpf?: string;
  rg?: string;
  address?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  maritalStatus?: string;
  instagram?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
};

type PreferencesInfo = {
  hasChildren?: string;
  childrenCount?: string;
  marketingConsent?: string;
  servicePackagesConsent?: string;
  serviceFeedbackConsent?: string;
  promotionsConsent?: string;
  campaignsConsent?: string;
  shirtModel?: string;
  shirtSize?: string;
  clothingSize?: string;
  shoeSize?: string;
  favoriteMusicGenre?: string;
  favoriteChocolate?: string;
  preferredNickname?: string;
};

type AlunoCadastroTabProps = {
  aluno: Aluno;
  schedulePlanLabel: string;
  formatGender: (value?: 'male' | 'female' | 'other') => string;
  identificationInfo: IdentificationInfo;
  preferencesInfo: PreferencesInfo;
  formatShirtPreference: (shirtModel?: string, shirtSize?: string) => string;
  segmentedProfile?: StudentSegmentedProfile | null;
};

const consentLabel = (value?: string) => {
  if (value === 'yes') return 'Sim';
  if (value === 'no') return 'Não';
  return 'Não informado';
};

const readSegmentedIdentification = (value?: Record<string, unknown> | null): IdentificationInfo => {
  if (!value) {
    return {};
  }

  const address = (value.address as Record<string, unknown> | undefined) ?? {};

  return {
    cpf: (value.cpf as string | undefined) ?? undefined,
    rg: (value.rg as string | undefined) ?? undefined,
    address: (address.street as string | undefined) ?? undefined,
    addressNumber: (address.number as string | undefined) ?? undefined,
    addressComplement: (address.complement as string | undefined) ?? undefined,
    neighborhood: (address.neighborhood as string | undefined) ?? undefined,
    city: (address.city as string | undefined) ?? undefined,
    state: (address.state as string | undefined) ?? undefined,
    zipCode: (address.zipCode as string | undefined) ?? undefined,
    maritalStatus: (value.maritalStatus as string | undefined) ?? undefined,
  };
};

const readSegmentedPreferences = (value?: Record<string, unknown> | null): PreferencesInfo => {
  if (!value) {
    return {};
  }

  return {
    hasChildren: (value.hasChildren as string | undefined) ?? undefined,
    childrenCount: (value.childrenCount as string | undefined) ?? undefined,
    marketingConsent: (value.marketingConsent as string | undefined) ?? undefined,
    servicePackagesConsent: (value.servicePackagesConsent as string | undefined) ?? undefined,
    serviceFeedbackConsent: (value.serviceFeedbackConsent as string | undefined) ?? undefined,
    promotionsConsent: (value.promotionsConsent as string | undefined) ?? undefined,
    campaignsConsent: (value.campaignsConsent as string | undefined) ?? undefined,
    shirtModel: (value.shirtModel as string | undefined) ?? undefined,
    shirtSize: (value.shirtSize as string | undefined) ?? undefined,
    clothingSize: (value.clothingSize as string | undefined) ?? undefined,
    shoeSize: (value.shoeSize as string | undefined) ?? undefined,
    favoriteMusicGenre: (value.favoriteMusicGenre as string | undefined) ?? undefined,
    favoriteChocolate: (value.favoriteChocolate as string | undefined) ?? undefined,
    preferredNickname: (value.preferredNickname as string | undefined) ?? undefined,
  };
};

export function AlunoCadastroTab({
  aluno,
  schedulePlanLabel,
  formatGender,
  identificationInfo,
  preferencesInfo,
  formatShirtPreference,
  segmentedProfile,
}: AlunoCadastroTabProps) {
  const segmentedIdentification = readSegmentedIdentification(
    (segmentedProfile?.identification as Record<string, unknown> | undefined) ?? undefined
  );
  const segmentedPreferences = readSegmentedPreferences(segmentedProfile?.preferences);
  const mergedIdentificationInfo = {
    ...identificationInfo,
    ...segmentedIdentification,
  };
  const mergedPreferencesInfo = {
    ...preferencesInfo,
    ...segmentedPreferences,
  };
  const fallbackMarketingConsent = mergedPreferencesInfo.marketingConsent;
  const birthDate =
    (segmentedProfile?.identification.birthDate as string | undefined) ?? aluno.user.profile.birthDate;
  const gender =
    (segmentedProfile?.identification.gender as 'male' | 'female' | 'other' | undefined) ??
    aluno.user.profile.gender;
  const email =
    (segmentedProfile?.identification.email as string | undefined) ?? aluno.user.email;
  const phone =
    (segmentedProfile?.identification.phone as string | undefined) ?? aluno.user.profile.phone;
  const instagram = mergedIdentificationInfo.instagram;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados informados pelo aluno</CardTitle>
          <CardDescription>
            Esta aba concentra somente informações declaradas no cadastro, sem misturar avaliações profissionais ou integrações futuras.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Data de nascimento</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {birthDate ? formatDateBR(birthDate) : 'Não informada'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Gênero</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {formatGender(gender)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Plano de agenda</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{schedulePlanLabel}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{email}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Telefone</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {phone || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Rede social</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {instagram || 'Não informada'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentação e endereço</CardTitle>
          <CardDescription>
            Identificação civil, endereço e contato de emergência fornecidos no cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">CPF</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{mergedIdentificationInfo.cpf || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">RG</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{mergedIdentificationInfo.rg || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Estado civil</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{mergedIdentificationInfo.maritalStatus || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">CEP</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{mergedIdentificationInfo.zipCode || 'Não informado'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 text-sm">
            <div className="text-xs text-muted-foreground">Endereço completo</div>
            <div className="mt-1 text-gray-900">
              {[mergedIdentificationInfo.address, mergedIdentificationInfo.addressNumber]
                .filter(Boolean)
                .join(', ') || 'Não informado'}
            </div>
            <div className="mt-1 text-muted-foreground">
              {[mergedIdentificationInfo.neighborhood, mergedIdentificationInfo.city, mergedIdentificationInfo.state]
                .filter(Boolean)
                .join(' - ') || 'Sem complemento de localidade'}
            </div>
            {mergedIdentificationInfo.addressComplement && (
              <div className="mt-1 text-muted-foreground">Complemento: {mergedIdentificationInfo.addressComplement}</div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Contato de emergência</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {mergedIdentificationInfo.emergencyContactName || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Telefone de emergência</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {mergedIdentificationInfo.emergencyContactPhone || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Relação</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {mergedIdentificationInfo.emergencyContactRelationship || 'Não informada'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferências e consentimentos</CardTitle>
          <CardDescription>
            Preferências pessoais e autorizações declaradas pelo aluno durante o onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Tem filhos</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{consentLabel(mergedPreferencesInfo.hasChildren)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Quantos filhos</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{mergedPreferencesInfo.childrenCount || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Camiseta</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {formatShirtPreference(mergedPreferencesInfo.shirtModel, mergedPreferencesInfo.shirtSize)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Calçado</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{mergedPreferencesInfo.shoeSize || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Mensagens de serviços</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {consentLabel(mergedPreferencesInfo.servicePackagesConsent || fallbackMarketingConsent)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Mensagens de campanhas</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {consentLabel(mergedPreferencesInfo.campaignsConsent || fallbackMarketingConsent)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Música favorita para treinar</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {mergedPreferencesInfo.favoriteMusicGenre || 'Não informada'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Chocolate favorito</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {mergedPreferencesInfo.favoriteChocolate || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Nome para personalização</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {mergedPreferencesInfo.preferredNickname || 'Não informado'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
