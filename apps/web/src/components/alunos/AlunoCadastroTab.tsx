import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type { Aluno } from '../../services/aluno.service';

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
};

const consentLabel = (value?: string) => {
  if (value === 'yes') return 'Sim';
  if (value === 'no') return 'Não';
  return 'Não informado';
};

export function AlunoCadastroTab({
  aluno,
  schedulePlanLabel,
  formatGender,
  identificationInfo,
  preferencesInfo,
  formatShirtPreference,
}: AlunoCadastroTabProps) {
  const fallbackMarketingConsent = preferencesInfo.marketingConsent;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cadastro Atual</CardTitle>
          <CardDescription>Dados cadastrais vigentes do aluno, separados dos registros históricos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Data de nascimento</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {aluno.user.profile.birthDate ? formatDateBR(aluno.user.profile.birthDate) : 'Não informada'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Gênero</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {formatGender(aluno.user.profile.gender)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Plano de agenda</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{schedulePlanLabel}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{aluno.user.email}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Telefone</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {aluno.user.profile.phone || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Rede social</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {identificationInfo.instagram || 'Não informada'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentação e Endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">CPF</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{identificationInfo.cpf || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">RG</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{identificationInfo.rg || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Estado civil</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{identificationInfo.maritalStatus || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">CEP</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{identificationInfo.zipCode || 'Não informado'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 text-sm">
            <div className="text-xs text-muted-foreground">Endereço completo</div>
            <div className="mt-1 text-gray-900">
              {[identificationInfo.address, identificationInfo.addressNumber]
                .filter(Boolean)
                .join(', ') || 'Não informado'}
            </div>
            <div className="mt-1 text-muted-foreground">
              {[identificationInfo.neighborhood, identificationInfo.city, identificationInfo.state]
                .filter(Boolean)
                .join(' - ') || 'Sem complemento de localidade'}
            </div>
            {identificationInfo.addressComplement && (
              <div className="mt-1 text-muted-foreground">Complemento: {identificationInfo.addressComplement}</div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Contato de emergência</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {identificationInfo.emergencyContactName || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Telefone de emergência</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {identificationInfo.emergencyContactPhone || 'Não informado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Relação</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {identificationInfo.emergencyContactRelationship || 'Não informada'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferências de Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Tem filhos</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{consentLabel(preferencesInfo.hasChildren)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Quantos filhos</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{preferencesInfo.childrenCount || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Camiseta</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {formatShirtPreference(preferencesInfo.shirtModel, preferencesInfo.shirtSize)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Calçado</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{preferencesInfo.shoeSize || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Mensagens de serviços</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {consentLabel(preferencesInfo.servicePackagesConsent || fallbackMarketingConsent)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Mensagens de campanhas</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {consentLabel(preferencesInfo.campaignsConsent || fallbackMarketingConsent)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
