import type {
  CollaboratorFunctionInfo,
  ContractInfo,
  ProfessorManagerInfo,
  ProfessorRole,
} from './auth';

export type ProfessorMaritalStatus =
  | 'single'
  | 'married'
  | 'stable_union'
  | 'divorced'
  | 'separated'
  | 'widowed'
  | 'other';

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
  addressComplement?: string;
  addressZipCode?: string;
  instagramHandle?: string;
  cref?: string;
  professionalSummary?: string;
  lattesUrl?: string;
  companyDocument?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  pixKey?: string;
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
  addressComplement?: string | null;
  addressZipCode?: string | null;
  instagramHandle?: string | null;
  cref?: string | null;
  professionalSummary?: string | null;
  lattesUrl?: string | null;
  companyDocument?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccount?: string | null;
  pixKey?: string | null;
  collaboratorFunctionId?: string;
  responsibleManagerId?: string;
}

export interface ProfessorSummary {
  id: string;
  role: ProfessorRole;
  collaboratorFunction: CollaboratorFunctionInfo;
  responsibleManager?: ProfessorManagerInfo | null;
  user: {
    id: string;
    email: string;
    isActive?: boolean;
    lastLoginAt?: string | null;
    profile: {
      name: string;
      phone?: string | null;
      birthDate?: string | null;
      cpf?: string | null;
      rg?: string | null;
      maritalStatus?: ProfessorMaritalStatus | null;
      addressStreet?: string | null;
      addressNumber?: string | null;
      addressComplement?: string | null;
      addressZipCode?: string | null;
      instagramHandle?: string | null;
      cref?: string | null;
      professionalSummary?: string | null;
      lattesUrl?: string | null;
      companyDocument?: string | null;
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
