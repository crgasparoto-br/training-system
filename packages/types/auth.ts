export interface JwtPayload {
  userId: string;
  email: string;
  type: 'educator' | 'student';
  iat?: number;
  exp?: number;
}

export type ContractType = 'academy' | 'personal';
export type EducatorRole = 'master' | 'educator';

export interface ContractInfo {
  id: string;
  type: ContractType;
  document: string;
  name?: string | null;
}

export interface EducatorInfo {
  id: string;
  role: EducatorRole;
  contract: ContractInfo;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  type: 'educator';
  contractType: ContractType;
  document: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    type: 'educator' | 'student';
    educator?: EducatorInfo | null;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}
