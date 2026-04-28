import type {
  CollaboratorFunctionInfo,
  ContractInfo,
  ProfessorManagerInfo,
  ProfessorRole,
} from './auth.js';

export type ProfessorMaritalStatus =
  | 'single'
  | 'married'
  | 'stable_union'
  | 'divorced'
  | 'separated'
  | 'widowed'
  | 'other';

export type HourlyRateLevelCode = string;

export interface HourlyRateLevel {
  id: string;
  code: HourlyRateLevelCode;
  label: string;
  minValue?: number | null;
  maxValue?: number | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessorHourlyRates {
  personal?: number | null;
  consulting?: number | null;
  evaluation?: number | null;
}

export interface CreateProfessorRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
  birthDate?: string;
  cpf?: string;
  rg?: string;
  maritalStatus?: ProfessorMaritalStatus;
  addressStreet?: string;
  addressNumber?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressComplement?: string;
  addressZipCode?: string;
  instagramHandle?: string;
  cref?: string;
  professionalSummary?: string;
  lattesUrl?: string;
  companyDocument?: string;
  bankCode?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  pixKey?: string;
  avatar?: string;
  admissionDate?: string;
  dismissalDate?: string;
  currentStatus?: string;
  operationalRoleIds?: string[];
  hourlyRates?: ProfessorHourlyRates;
  hasSignedContract?: boolean;
  signedContractDocumentUrl?: string;
  collaboratorFunctionId: string;
  responsibleManagerId?: string;
}

export interface UpdateProfessorRequest {
  name?: string;
  email?: string;
  password?: string;
  phone?: string | null;
  birthDate?: string | null;
  cpf?: string | null;
  rg?: string | null;
  maritalStatus?: ProfessorMaritalStatus | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressComplement?: string | null;
  addressZipCode?: string | null;
  instagramHandle?: string | null;
  cref?: string | null;
  professionalSummary?: string | null;
  lattesUrl?: string | null;
  companyDocument?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccount?: string | null;
  pixKey?: string | null;
  avatar?: string | null;
  admissionDate?: string | null;
  dismissalDate?: string | null;
  currentStatus?: string | null;
  operationalRoleIds?: string[];
  hourlyRates?: ProfessorHourlyRates;
  hasSignedContract?: boolean;
  signedContractDocumentUrl?: string | null;
  collaboratorFunctionId?: string;
  responsibleManagerId?: string;
}

export interface ProfessorSummary {
  id: string;
  role: ProfessorRole;
  collaboratorFunction: CollaboratorFunctionInfo;
  responsibleManager?: ProfessorManagerInfo | null;
  admissionDate?: string | null;
  dismissalDate?: string | null;
  currentStatus?: string | null;
  operationalRoleIds: string[];
  hourlyRates?: ProfessorHourlyRates | null;
  hasSignedContract: boolean;
  signedContractDocumentUrl?: string | null;
  user: {
    id: string;
    email: string;
    isActive?: boolean;
    lastLoginAt?: string | null;
    profile: {
      name: string;
      avatar?: string | null;
      phone?: string | null;
      birthDate?: string | null;
      cpf?: string | null;
      rg?: string | null;
      maritalStatus?: ProfessorMaritalStatus | null;
      addressStreet?: string | null;
      addressNumber?: string | null;
      addressNeighborhood?: string | null;
      addressCity?: string | null;
      addressState?: string | null;
      addressComplement?: string | null;
      addressZipCode?: string | null;
      instagramHandle?: string | null;
      cref?: string | null;
      professionalSummary?: string | null;
      lattesUrl?: string | null;
      companyDocument?: string | null;
      bankCode?: string | null;
      bankName?: string | null;
      bankBranch?: string | null;
      bankAccount?: string | null;
      pixKey?: string | null;
      legalFinancialProvidedAt?: string | null;
      legalFinancialValidatedAt?: string | null;
      legalFinancialProvidedByProfessor?: {
        id: string;
        user?: {
          profile?: {
            name: string;
          } | null;
        } | null;
      } | null;
      legalFinancialValidatedByProfessor?: {
        id: string;
        user?: {
          profile?: {
            name: string;
          } | null;
        } | null;
      } | null;
    };
  };
  contract: ContractInfo;
  createdAt: string;
}
