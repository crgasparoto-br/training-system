export interface JwtPayload {
  userId: string;
  email: string;
  type: 'professor' | 'aluno';
  iat?: number;
  exp?: number;
}

export type ContractType = 'academy' | 'personal';
export type ProfessorRole = 'master' | 'professor';

export interface UserAccessPermission {
  id?: string;
  collaboratorFunctionId?: string;
  screenKey: string;
  blockKey?: string | null;
  canView: boolean;
}

export interface UserAccessControl {
  isMaster: boolean;
  permissions: UserAccessPermission[];
}

export interface CollaboratorFunctionInfo {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isSystem?: boolean;
  accessPermissions?: UserAccessPermission[];
}

export interface ProfessorManagerInfo {
  id: string;
  role: ProfessorRole;
  user: {
    id: string;
    email: string;
    isActive?: boolean;
    profile: {
      name: string;
      phone?: string | null;
    };
  };
  collaboratorFunction: CollaboratorFunctionInfo;
}

export interface ContractInfo {
  id: string;
  type: ContractType;
  document: string;
  name?: string | null;
}

export interface ProfessorInfo {
  id: string;
  role: ProfessorRole;
  collaboratorFunction: CollaboratorFunctionInfo;
  responsibleManager?: ProfessorManagerInfo | null;
  contract: ContractInfo;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string;
  resetUrl?: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  type: 'professor';
  contractType: ContractType;
  document: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    type: 'professor' | 'aluno';
    professor?: ProfessorInfo | null;
    accessControl?: UserAccessControl;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

