export interface AlunoProfile {
  id: string;
  userId: string;
  professorId: string;
  serviceId?: string;
  schedulePlan: 'free' | 'fixed';
  birthDate?: Date;
  gender?: 'male' | 'female' | 'other';
  
  // Dados Antropométricos
  age: number;
  weight: number; // kg
  height: number; // cm
  bodyFatPercentage?: number; // %
  
  // Performance
  vo2Max: number; // ml/kg/min
  anaerobicThreshold: number; // km/h
  maxHeartRate: number; // bpm
  restingHeartRate: number; // bpm
  systolicPressure?: number;
  diastolicPressure?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AlunoMacronutrients {
  carbohydratesPercentage?: number;
  proteinsPercentage?: number;
  lipidsPercentage?: number;
  dailyCalories?: number;
}

export interface AlunoIntakeForm {
  assessmentDate?: Date;
  mainGoal?: string;
  medicalHistory?: string;
  currentMedications?: string;
  injuriesHistory?: string;
  trainingBackground?: string;
  observations?: string;
  parqResponses?: {
    q1: boolean;
    q2: boolean;
    q3: boolean;
    q4: boolean;
    q5: boolean;
    q6: boolean;
    q7: boolean;
    q8: boolean;
  };
  formResponses?: Record<string, unknown>;
}

export interface CreateAlunoRequest {
  name: string;
  email: string;
  phone?: string;
  serviceId?: string;
  schedulePlan: 'free' | 'fixed';
  birthDate?: Date;
  gender?: 'male' | 'female' | 'other';
  age: number;
  weight: number;
  height: number;
  vo2Max: number;
  anaerobicThreshold: number;
  maxHeartRate: number;
  restingHeartRate: number;
  bodyFatPercentage?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: AlunoMacronutrients;
  intakeForm?: AlunoIntakeForm;
}

export interface UpdateAlunoRequest {
  serviceId?: string;
  schedulePlan?: 'free' | 'fixed';
  birthDate?: Date;
  gender?: 'male' | 'female' | 'other';
  age?: number;
  weight?: number;
  height?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  bodyFatPercentage?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: AlunoMacronutrients;
  intakeForm?: AlunoIntakeForm;
}

export type StudentContractActivationReason =
  | 'awaiting_signature'
  | 'scheduled_start'
  | 'activated';

export type StudentContractLifecycleStatus =
  | 'draft'
  | 'pending_signature'
  | 'active'
  | 'expired'
  | 'canceled'
  | 'terminated';

export interface StudentContractActivationLink {
  id: string;
  alunoId: string;
  contractId: string;
  serviceId: string | null;
  status: StudentContractLifecycleStatus;
  startDate: string | null;
  endDate: string | null;
  signedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  amount: number | null;
  paymentDay: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentContractActivationResponse {
  studentContract: StudentContractActivationLink;
  activationDeferred: boolean;
  reason: StudentContractActivationReason;
  effectiveAt?: string;
}
