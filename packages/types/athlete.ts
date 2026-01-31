export interface AthleteProfile {
  id: string;
  userId: string;
  educatorId: string;
  
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
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAthleteRequest {
  age: number;
  weight: number;
  height: number;
  vo2Max: number;
  anaerobicThreshold: number;
  maxHeartRate: number;
  restingHeartRate: number;
  bodyFatPercentage?: number;
}

export interface UpdateAthleteRequest {
  age?: number;
  weight?: number;
  height?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  bodyFatPercentage?: number;
}
