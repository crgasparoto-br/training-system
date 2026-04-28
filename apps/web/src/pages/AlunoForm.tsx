import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ProfessorSummary, ServiceOption } from '@corrida/types';
import { alunoService, type AlunoAssessmentPrefill, type CreateAlunoDTO, type UpdateAlunoDTO } from '../services/aluno.service';
import { professorService } from '../services/professor.service';
import { serviceCatalogService } from '../services/service.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { ArrowLeft, ClipboardList, FileText, HeartPulse, Sparkles, Upload, User, Wallet, X } from 'lucide-react';
import { alunoFormCopy } from '../i18n/ptBR';

const numberOrUndefined = (value: unknown) =>
  typeof value === 'number' && Number.isNaN(value) ? undefined : value;

const optionalNumberSchema = (schema: z.ZodNumber) =>
  z.preprocess(numberOrUndefined, schema.optional());

const identificationSchema = z.object({
  cpf: z.string().optional(),
  rg: z.string().optional(),
  address: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  maritalStatus: z.string().optional(),
  instagram: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
});

const financialSchema = z.object({
  currentService: z.string().optional(),
  specialCondition: z.string().optional(),
  monthlyValue: z.string().optional(),
  discountPercentage: z.string().optional(),
  responsibleProfessorId: z.string().optional(),
  responsibleProfessorName: z.string().optional(),
  paymentDay: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractDurationUnit: z.enum(['', 'days', 'months', 'years']).optional(),
  contractDurationQuantity: z.string().optional(),
  contractDueDate: z.string().optional(),
  contract: z.string().optional(),
  cameFromReferral: z.enum(['', 'yes', 'no']).optional(),
  referralPerson: z.string().optional(),
  otherObservations: z.string().optional(),
});

const preferencesSchema = z.object({
  hasChildren: z.enum(['', 'yes', 'no']).optional(),
  childrenCount: z.string().optional(),
  marketingConsent: z.enum(['', 'yes', 'no']).optional(),
  servicePackagesConsent: z.enum(['', 'yes', 'no']).optional(),
  serviceFeedbackConsent: z.enum(['', 'yes', 'no']).optional(),
  promotionsConsent: z.enum(['', 'yes', 'no']).optional(),
  campaignsConsent: z.enum(['', 'yes', 'no']).optional(),
  shirtModel: z.enum(['', 'traditional', 'babylook']).optional(),
  shirtSize: z.string().optional(),
  clothingSize: z.string().optional(),
  shoeSize: z.string().optional(),
  favoriteMusicGenre: z.string().optional(),
  favoriteChocolate: z.string().optional(),
  preferredNickname: z.string().optional(),
});

const ahaResponseSchema = z.union([z.literal(''), z.enum(['yes', 'no', 'unknown'])]);

const requiredNumber = (message: string) =>
  z.number({
    required_error: message,
    invalid_type_error: message,
  });

const alunoSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  avatar: z.string().optional(),
  phone: z.string().optional(),
  serviceId: z.string().min(1, 'Selecione o serviço de interesse'),
  birthDate: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  schedulePlan: z.enum(['free', 'fixed']),
  age: requiredNumber('Idade é obrigatória').int().min(10, 'Idade mínima: 10 anos').max(100, 'Idade máxima: 100 anos'),
  weight: optionalNumberSchema(z.number().positive('Peso deve ser positivo')),
  height: optionalNumberSchema(z.number().positive('Altura deve ser positiva')),
  bodyFatPercentage: optionalNumberSchema(z.number().min(0).max(100)),
  vo2Max: optionalNumberSchema(z.number().positive('VO2 Max deve ser positivo')),
  anaerobicThreshold: optionalNumberSchema(z.number().positive('Limiar anaeróbico deve ser positivo')),
  maxHeartRate: optionalNumberSchema(z.number().int().min(100, 'FC máxima mínima: 100 bpm').max(220, 'FC máxima máxima: 220 bpm')),
  restingHeartRate: optionalNumberSchema(z.number().int().min(30, 'FC de repouso mínima: 30 bpm').max(100, 'FC de repouso máxima: 100 bpm')),
  systolicPressure: optionalNumberSchema(z.number().int().min(80).max(240)),
  diastolicPressure: optionalNumberSchema(z.number().int().min(40).max(160)),
  macronutrients: z.object({
    carbohydratesPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    proteinsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    lipidsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    dailyCalories: optionalNumberSchema(z.number().int().positive()),
  }),
  intakeForm: z.object({
    assessmentDate: z.string().optional(),
    mainGoal: z.string().optional(),
    medicalHistory: z.string().optional(),
    currentMedications: z.string().optional(),
    injuriesHistory: z.string().optional(),
    trainingBackground: z.string().optional(),
    observations: z.string().optional(),
    personalInfo: identificationSchema,
    financialInfo: financialSchema,
    preferencesInfo: preferencesSchema,
    parqResponses: z.object({
      q1: z.boolean(),
      q2: z.boolean(),
      q3: z.boolean(),
      q4: z.boolean(),
      q5: z.boolean(),
      q6: z.boolean(),
      q7: z.boolean(),
      q8: z.boolean(),
    }),
    ahaResponses: z.record(ahaResponseSchema),
  }),
});

type AlunoFormData = z.infer<typeof alunoSchema>;

const baseUrl = import.meta.env.VITE_API_URL || '';

const getAvatarInitials = (name?: string) => {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'AL';
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
};

const resolveAvatarUrl = (avatar?: string | null) => {
  if (!avatar) {
    return '';
  }

  if (/^(https?:|data:|blob:)/i.test(avatar)) {
    return avatar;
  }

  return `${baseUrl}/${avatar}`;
};

const selectClassName =
  'flex h-12 w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]';

const compactSelectClassName =
  'flex h-10 w-full rounded-lg border border-[#cbd5e1] bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]';

const textareaClassName =
  'flex min-h-[120px] w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background placeholder:text-[#94a3b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]';

const parqQuestions = [
  {
    key: 'q1',
    label:
      '1. Algum médico já disse que você possui algum problema de coração e que só deveria realizar atividade física recomendada por um médico?',
  },
  { key: 'q2', label: '2. Você sente dor no tórax quando pratica uma atividade física?' },
  {
    key: 'q3',
    label:
      '3. No último mês, você sentiu dor no tórax quando não estava praticando atividade física?',
  },
  {
    key: 'q4',
    label: '4. Você perde o equilíbrio por causa de tontura ou já perdeu a consciência?',
  },
  {
    key: 'q5',
    label:
      '5. Você tem algum problema ósseo ou articular que poderia piorar por uma mudança na sua atividade física?',
  },
  {
    key: 'q6',
    label:
      '6. Algum médico está prescrevendo medicamento para sua pressão arterial ou condição cardíaca?',
  },
  {
    key: 'q7',
    label:
      '7. Você sabe de qualquer outro motivo pelo qual não deveria praticar atividade física?',
  },
] as const;

const ahaQuestionGroups = [
  {
    title: 'Fatores de Risco (FR)',
    questions: [
      {
        key: 'fr1',
        label:
          'FR1. Algum dos seus pais ou irmãos teve ataque cardíaco, cirurgia de safena, angioplastia ou morte (antes dos 55 anos para homens e 65 anos para mulheres)?',
      },
      { key: 'fr2', label: 'FR2. Tem fumado cigarro nos últimos 6 meses?' },
      {
        key: 'fr3',
        label:
          'FR3. Sua pressão arterial usual é maior ou igual a 140/90 mmHg? Você toma medicamento para pressão alta?',
      },
      {
        key: 'fr4',
        label:
          'FR4. O seu nível de LDL colesterol (ruim) é maior que 130 mg/dl? Ou seu nível de colesterol total é maior que 200 mg/dl ou seu nível de colesterol HDL (bom) é menor que 35 mg/dl?',
      },
      { key: 'fr5', label: 'FR5. O seu nível de glicose é maior ou igual a 110 mg/dl?' },
      { key: 'fr6', label: 'FR6. O seu índice de massa corporal (peso kg : altura m) é igual ou maior que 30 kg/m²?' },
      { key: 'fr7', label: 'FR7. O perímetro da cintura é maior que 100 cm?' },
      {
        key: 'fr8',
        label:
          'FR8. Você não realiza pelo menos 30 minutos de atividade física de intensidade moderada na maioria dos dias da semana?',
      },
    ],
  },
  {
    title: 'Sinais e Sintomas (SR)',
    questions: [
      { key: 'sr1', label: 'SR1. Você alguma vez teve dor ou desconforto no peito ou áreas próximas (isquemia)?' },
      { key: 'sr2', label: 'SR2. Você sente falta de ar em repouso ou com esforço?' },
      { key: 'sr3', label: 'SR3. Você alguma vez sentiu tontura ou vertigem (não considerar após levantar-se da cama)?' },
      { key: 'sr4', label: 'SR4. Você sente dificuldade para respirar quando deitado ou dormindo?' },
      { key: 'sr5', label: 'SR5. Seus tornozelos sempre estão inchados (não considerar após longos períodos em pé)?' },
      { key: 'sr6', label: 'SR6. Você já teve palpitações ou períodos de aceleração da frequência cardíaca sem motivo?' },
      { key: 'sr7', label: 'SR7. Você sente dor nas pernas (claudicação intermitente)?' },
      { key: 'sr8a', label: 'SR8a. O médico já lhe disse que você tem sopro no coração?' },
      { key: 'sr8b', label: 'SR8b. Está liberado para prática de exercícios?' },
      { key: 'sr9', label: 'SR9. Você sente fadiga ou dificuldade para respirar em atividades usuais?' },
    ],
  },
  {
    title: 'Outros (OT)',
    questions: [
      { key: 'ot1', label: 'OT1. Você é homem com mais de 45 anos ou mulher com mais de 55 anos?' },
      {
        key: 'ot2',
        label:
          'OT2. Você tem alguma doença — cardíaca, vascular periférica, vascular cerebral, pulmonar obstrutiva crônica, asma, doença intersticial pulmonar, fibrose cística, diabetes mellitus, desordens de tireoide, doença renal ou hepática?',
      },
      { key: 'ot3', label: 'OT3. Você tem qualquer problema ósseo ou articular como artrite ou lesão que pode piorar com o exercício?' },
      { key: 'ot4', label: 'OT4. Você está com um resfriado ou qualquer outra infecção?' },
      { key: 'ot5', label: 'OT5. Você está grávida?' },
      { key: 'ot6', label: 'OT6. Você tem qualquer outro problema que possa dificultar o exercício extenuante?' },
    ],
  },
] as const;

const defaultAhaResponses = Object.fromEntries(
  ahaQuestionGroups.flatMap((group) => group.questions.map((question) => [question.key, '']))
) as Record<string, z.infer<typeof ahaResponseSchema>>;

const ahaAnswerOptions = [
  { value: '', label: '' },
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
  { value: 'unknown', label: 'Não sei' },
] as const;

type AlunoFormTab = 'anamneseInicial' | 'identificacao' | 'financeiro' | 'preferencias' | 'parq' | 'aha';

type AlunoFormResponses = {
  identification?: Partial<AlunoFormData['intakeForm']['personalInfo']>;
  financial?: Partial<AlunoFormData['intakeForm']['financialInfo']>;
  preferences?: Partial<AlunoFormData['intakeForm']['preferencesInfo']>;
  parqResponses?: Partial<AlunoFormData['intakeForm']['parqResponses']>;
  ahaResponses?: Record<string, unknown>;
};

const readFormResponses = (value?: Record<string, unknown>): AlunoFormResponses =>
  value && typeof value === 'object' ? (value as AlunoFormResponses) : {};

const formatDateForInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return '';

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
};

const calculateAgeFromBirthDate = (value?: string) => {
  if (!value) return undefined;

  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return undefined;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : undefined;
};

export function AlunoForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillFile, setPrefillFile] = useState<File | null>(null);
  const [prefillSummary, setPrefillSummary] = useState<string>('');
  const [isPrefillModalOpen, setIsPrefillModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AlunoFormTab>('anamneseInicial');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [professorOptions, setProfessorOptions] = useState<ProfessorSummary[]>([]);
  const [professorsLoading, setProfessorsLoading] = useState(true);
  const [professorsError, setProfessorsError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<AlunoFormData>({
    resolver: zodResolver(alunoSchema),
    defaultValues: {
      avatar: '',
      serviceId: '',
      schedulePlan: 'free',
      gender: 'male',
      macronutrients: {
        carbohydratesPercentage: undefined,
        proteinsPercentage: undefined,
        lipidsPercentage: undefined,
        dailyCalories: undefined,
      },
      intakeForm: {
        assessmentDate: '',
        mainGoal: '',
        medicalHistory: '',
        currentMedications: '',
        injuriesHistory: '',
        trainingBackground: '',
        observations: '',
        personalInfo: {
          cpf: '',
          rg: '',
          address: '',
          addressNumber: '',
          addressComplement: '',
          neighborhood: '',
          city: '',
          state: '',
          zipCode: '',
          maritalStatus: '',
          instagram: '',
          emergencyContactName: '',
          emergencyContactPhone: '',
          emergencyContactRelationship: '',
        },
        financialInfo: {
          currentService: '',
          specialCondition: '',
          monthlyValue: '',
          discountPercentage: '',
          responsibleProfessorId: '',
          responsibleProfessorName: '',
          paymentDay: '',
          contractStartDate: '',
          contractDurationUnit: '',
          contractDurationQuantity: '',
          contractDueDate: '',
          contract: '',
          cameFromReferral: '',
          referralPerson: '',
          otherObservations: '',
        },
        preferencesInfo: {
          hasChildren: '',
          childrenCount: '',
          marketingConsent: '',
          servicePackagesConsent: '',
          serviceFeedbackConsent: '',
          promotionsConsent: '',
          campaignsConsent: '',
          shirtModel: '',
          shirtSize: '',
          clothingSize: '',
          shoeSize: '',
          favoriteMusicGenre: '',
          favoriteChocolate: '',
          preferredNickname: '',
        },
        parqResponses: {
          q1: false,
          q2: false,
          q3: false,
          q4: false,
          q5: false,
          q6: false,
          q7: false,
          q8: false,
        },
        ahaResponses: defaultAhaResponses,
      },
    },
  });

  const weight = watch('weight');
  const height = watch('height');
  const birthDate = watch('birthDate');
  const avatar = watch('avatar');
  const studentName = watch('name');
  const cameFromReferral = watch('intakeForm.financialInfo.cameFromReferral');
  const calculatedAge = calculateAgeFromBirthDate(birthDate);
  const parqDeclarationAccepted = watch('intakeForm.parqResponses.q8');
  const bmi = weight && height ? alunoService.calculateBMI(weight, height) : 0;
  const bmiClass = bmi ? alunoService.getBMIClassification(bmi) : '';
  const resolvedAvatar = resolveAvatarUrl(avatar);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  };

  const formatCurrencyInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';

    const amount = Number(digits) / 100;
    return amount.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatCurrencyValue = (value: number) =>
    value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatPercentageInput = (value: string) => {
    const sanitized = value.replace(/[^\d,]/g, '');
    const [integerPart, decimalPart] = sanitized.split(',');
    const limitedInteger = (integerPart || '').slice(0, 3);
    const limitedDecimal = (decimalPart || '').slice(0, 2);
    const normalized = limitedDecimal ? `${limitedInteger},${limitedDecimal}` : limitedInteger;

    if (!normalized) return '';

    const numericValue = Number(normalized.replace(',', '.'));
    if (!Number.isFinite(numericValue)) return '';
    if (numericValue < 0) return '0';
    if (numericValue > 100) return '100';

    return normalized;
  };

  const parseCurrencyInput = (value?: string) => {
    if (!value) return undefined;

    const normalized = value.replace(/\./g, '').replace(',', '.');
    const numericValue = Number(normalized);

    return Number.isFinite(numericValue) ? numericValue : undefined;
  };

  const normalizeDurationQuantity = (value: string) => value.replace(/\D/g, '').slice(0, 3);

  const formatInputDateFromParts = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const addMonthsPreservingDay = (baseDate: Date, quantity: number) => {
    const originalDay = baseDate.getDate();
    const targetMonthIndex = baseDate.getMonth() + quantity;
    const targetYear = baseDate.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();

    return new Date(targetYear, normalizedMonth, Math.min(originalDay, lastDayOfTargetMonth));
  };

  const calculateContractDueDate = (startDate?: string, unit?: string, quantity?: string) => {
    if (!startDate || !unit || !quantity) {
      return '';
    }

    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      return '';
    }

    const [year, month, day] = startDate.split('-').map(Number);
    const baseDate = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(baseDate.getTime())) {
      return '';
    }

    let dueDate = new Date(baseDate);

    if (unit === 'days') {
      dueDate.setDate(dueDate.getDate() + numericQuantity);
    } else if (unit === 'months') {
      dueDate = addMonthsPreservingDay(baseDate, numericQuantity);
    } else if (unit === 'years') {
      dueDate = addMonthsPreservingDay(baseDate, numericQuantity * 12);
    } else {
      return '';
    }

    return formatInputDateFromParts(dueDate);
  };

  const calculateDiscountedMonthlyValue = (referenceValue: number, discount?: string) => {
    const numericDiscount = Number((discount || '').replace(',', '.'));
    const safeDiscount = Number.isFinite(numericDiscount)
      ? Math.min(Math.max(numericDiscount, 0), 100)
      : 0;

    return formatCurrencyValue(referenceValue * (1 - safeDiscount / 100));
  };

  const normalizePaymentDay = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    if (!digits) return '';

    const day = Number(digits);
    if (!Number.isFinite(day)) return '';
    if (day <= 0) return '1';
    if (day > 31) return '31';
    return String(day);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAvatarUploading(true);
    try {
      const uploadedAvatar = await alunoService.uploadAvatar(file);
      setValue('avatar', uploadedAvatar, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    } catch (error: any) {
      console.error('Erro ao enviar foto do aluno:', error);
      alert(error.response?.data?.error || 'Erro ao enviar foto do aluno');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  const applyAssessmentPrefill = (prefill: AlunoAssessmentPrefill) => {
    if (!isEditMode && prefill.name) setValue('name', prefill.name);
    if (prefill.birthDate) setValue('birthDate', formatDateForInput(prefill.birthDate));
    if (prefill.gender) setValue('gender', prefill.gender);
    if (prefill.age !== undefined) setValue('age', prefill.age);
    if (prefill.weight !== undefined) setValue('weight', prefill.weight);
    if (prefill.height !== undefined) setValue('height', prefill.height);
    if (prefill.bodyFatPercentage !== undefined) {
      setValue('bodyFatPercentage', prefill.bodyFatPercentage);
    }
    if (prefill.vo2Max !== undefined) setValue('vo2Max', prefill.vo2Max);
    if (prefill.anaerobicThreshold !== undefined) {
      setValue('anaerobicThreshold', prefill.anaerobicThreshold);
    }
    if (prefill.maxHeartRate !== undefined) setValue('maxHeartRate', prefill.maxHeartRate);
    if (prefill.restingHeartRate !== undefined) {
      setValue('restingHeartRate', prefill.restingHeartRate);
    }
    if (prefill.systolicPressure !== undefined) {
      setValue('systolicPressure', prefill.systolicPressure);
    }
    if (prefill.diastolicPressure !== undefined) {
      setValue('diastolicPressure', prefill.diastolicPressure);
    }
    if (prefill.macronutrients?.carbohydratesPercentage !== undefined) {
      setValue('macronutrients.carbohydratesPercentage', prefill.macronutrients.carbohydratesPercentage);
    }
    if (prefill.macronutrients?.proteinsPercentage !== undefined) {
      setValue('macronutrients.proteinsPercentage', prefill.macronutrients.proteinsPercentage);
    }
    if (prefill.macronutrients?.lipidsPercentage !== undefined) {
      setValue('macronutrients.lipidsPercentage', prefill.macronutrients.lipidsPercentage);
    }
    if (prefill.macronutrients?.dailyCalories !== undefined) {
      setValue('macronutrients.dailyCalories', prefill.macronutrients.dailyCalories);
    }
    if (prefill.intakeForm?.assessmentDate) {
      setValue('intakeForm.assessmentDate', formatDateForInput(prefill.intakeForm.assessmentDate));
    }
    if (prefill.intakeForm?.trainingBackground) {
      setValue('intakeForm.trainingBackground', prefill.intakeForm.trainingBackground);
    }
    if (prefill.intakeForm?.observations) {
      setValue('intakeForm.observations', prefill.intakeForm.observations);
    }
  };

  const handleAssessmentPrefill = async () => {
    if (!prefillFile) {
      alert(alunoFormCopy.prefillValidation);
      return;
    }

    setPrefillLoading(true);
    try {
      const prefill = await alunoService.previewAssessmentPdf(prefillFile);
      applyAssessmentPrefill(prefill);

      const summaryParts = [
        prefill.extractedPreview?.sourceName ? `Nome identificado: ${prefill.extractedPreview.sourceName}` : null,
        prefill.extractedPreview?.sourceAssessmentDate
          ? `Data da avaliação: ${formatDateForInput(prefill.extractedPreview.sourceAssessmentDate)}`
          : null,
      ].filter(Boolean);

      setPrefillSummary(
        summaryParts.length > 0
          ? summaryParts.join(' | ')
          : alunoFormCopy.prefillSummaryFallback
      );
    } catch (error: any) {
      console.error('Erro ao pre-preencher cadastro:', error);
      alert(error.response?.data?.error || alunoFormCopy.prefillReadError);
    } finally {
      setPrefillLoading(false);
    }
  };

  useEffect(() => {
    loadServiceOptions();
    loadProfessorOptions();
  }, []);

  useEffect(() => {
    if (isEditMode && id) {
      loadAlunoData(id);
    }
  }, [id, isEditMode]);

  useEffect(() => {
    if (calculatedAge === undefined) {
      return;
    }

    setValue('age', calculatedAge, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [calculatedAge, setValue]);

  useEffect(() => {
    if (cameFromReferral === 'yes') {
      return;
    }

    setValue('intakeForm.financialInfo.referralPerson', '', {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [cameFromReferral, setValue]);

  const loadServiceOptions = async () => {
    setServicesLoading(true);
    setServicesError(null);
    try {
      const data = await serviceCatalogService.list();
      setServiceOptions(data.filter((item) => item.isActive));
    } catch (error: any) {
      console.error('Erro ao carregar serviços:', error);
      setServicesError(error.response?.data?.error || 'Erro ao carregar serviços');
    } finally {
      setServicesLoading(false);
    }
  };

  const loadProfessorOptions = async () => {
    setProfessorsLoading(true);
    setProfessorsError(null);
    try {
      const data = await professorService.list('active');
      setProfessorOptions(data);
    } catch (error: any) {
      console.error('Erro ao carregar professores:', error);
      setProfessorsError(error.response?.data?.error || 'Erro ao carregar professores');
    } finally {
      setProfessorsLoading(false);
    }
  };

  const interestServiceOptions = serviceOptions.filter((item) => !item.parentServiceId);
  const financialServiceOptions = serviceOptions.filter((item) => item.parentServiceId);
  const selectedFinancialServiceName = watch('intakeForm.financialInfo.currentService');
  const monthlyValue = watch('intakeForm.financialInfo.monthlyValue');
  const discountPercentage = watch('intakeForm.financialInfo.discountPercentage');
  const selectedFinancialService = financialServiceOptions.find(
    (item) => item.name === selectedFinancialServiceName
  );
  const contractStartDate = watch('intakeForm.financialInfo.contractStartDate');
  const contractDurationUnit = watch('intakeForm.financialInfo.contractDurationUnit');
  const contractDurationQuantity = watch('intakeForm.financialInfo.contractDurationQuantity');
  const currentContractDueDate = watch('intakeForm.financialInfo.contractDueDate');
  const discountedMonthlyValue = (() => {
    const numericMonthlyValue = parseCurrencyInput(monthlyValue);

    if (numericMonthlyValue === undefined) {
      return '';
    }

    return calculateDiscountedMonthlyValue(numericMonthlyValue, discountPercentage);
  })();
  const calculatedContractDueDate =
    calculateContractDueDate(contractStartDate, contractDurationUnit, contractDurationQuantity) ||
    currentContractDueDate ||
    '';

  const loadAlunoData = async (alunoId: string) => {
    setLoadingData(true);
    try {
      const aluno = await alunoService.getById(alunoId);
      setValue('name', aluno.user.profile.name);
      setValue('email', aluno.user.email);
      setValue('avatar', aluno.user.profile.avatar || '');
      setValue('phone', aluno.user.profile.phone || '');
      setValue('serviceId', aluno.service?.id || '');
      setValue('birthDate', formatDateForInput(aluno.user.profile.birthDate));
      setValue('gender', aluno.user.profile.gender || 'male');
      setValue('schedulePlan', aluno.schedulePlan);
      setValue('age', aluno.age);
      setValue('weight', aluno.weight ?? undefined);
      setValue('height', aluno.height ?? undefined);
      setValue('bodyFatPercentage', aluno.bodyFatPercentage ?? undefined);
      setValue('vo2Max', aluno.vo2Max ?? undefined);
      setValue('anaerobicThreshold', aluno.anaerobicThreshold ?? undefined);
      setValue('maxHeartRate', aluno.maxHeartRate ?? undefined);
      setValue('restingHeartRate', aluno.restingHeartRate ?? undefined);
      setValue('systolicPressure', aluno.systolicPressure);
      setValue('diastolicPressure', aluno.diastolicPressure);
      setValue('macronutrients.carbohydratesPercentage', aluno.macronutrients?.carbohydratesPercentage);
      setValue('macronutrients.proteinsPercentage', aluno.macronutrients?.proteinsPercentage);
      setValue('macronutrients.lipidsPercentage', aluno.macronutrients?.lipidsPercentage);
      setValue('macronutrients.dailyCalories', aluno.macronutrients?.dailyCalories);
      setValue('intakeForm.assessmentDate', formatDateForInput(aluno.intakeForm?.assessmentDate));
      setValue('intakeForm.mainGoal', aluno.intakeForm?.mainGoal || '');
      setValue('intakeForm.medicalHistory', aluno.intakeForm?.medicalHistory || '');
      setValue('intakeForm.currentMedications', aluno.intakeForm?.currentMedications || '');
      setValue('intakeForm.injuriesHistory', aluno.intakeForm?.injuriesHistory || '');
      setValue('intakeForm.trainingBackground', aluno.intakeForm?.trainingBackground || '');
      setValue('intakeForm.observations', aluno.intakeForm?.observations || '');
      const formResponses = readFormResponses(aluno.intakeForm?.formResponses);
      const identification = formResponses.identification ?? {};
      const financial = formResponses.financial ?? {};
      const preferences = formResponses.preferences ?? {};
      setValue('intakeForm.personalInfo.cpf', identification.cpf || '');
      setValue('intakeForm.personalInfo.rg', identification.rg || '');
      setValue('intakeForm.personalInfo.address', identification.address || '');
      setValue('intakeForm.personalInfo.addressNumber', identification.addressNumber || '');
      setValue('intakeForm.personalInfo.addressComplement', identification.addressComplement || '');
      setValue('intakeForm.personalInfo.neighborhood', identification.neighborhood || '');
      setValue('intakeForm.personalInfo.city', identification.city || '');
      setValue('intakeForm.personalInfo.state', identification.state || '');
      setValue('intakeForm.personalInfo.zipCode', identification.zipCode || '');
      setValue('intakeForm.personalInfo.maritalStatus', identification.maritalStatus || '');
      setValue('intakeForm.personalInfo.instagram', identification.instagram || '');
      setValue('intakeForm.personalInfo.emergencyContactName', identification.emergencyContactName || '');
      setValue('intakeForm.personalInfo.emergencyContactPhone', identification.emergencyContactPhone || '');
      setValue('intakeForm.personalInfo.emergencyContactRelationship', identification.emergencyContactRelationship || '');
      setValue('intakeForm.financialInfo.currentService', financial.currentService || '');
      setValue('intakeForm.financialInfo.specialCondition', financial.specialCondition || '');
      setValue('intakeForm.financialInfo.monthlyValue', financial.monthlyValue || '');
      setValue('intakeForm.financialInfo.discountPercentage', financial.discountPercentage || '');
      setValue('intakeForm.financialInfo.responsibleProfessorId', financial.responsibleProfessorId || '');
      setValue('intakeForm.financialInfo.responsibleProfessorName', financial.responsibleProfessorName || '');
      setValue('intakeForm.financialInfo.paymentDay', financial.paymentDay || '');
      setValue('intakeForm.financialInfo.contractStartDate', financial.contractStartDate || '');
      setValue('intakeForm.financialInfo.contractDurationUnit', financial.contractDurationUnit || '');
      setValue('intakeForm.financialInfo.contractDurationQuantity', financial.contractDurationQuantity || '');
      setValue('intakeForm.financialInfo.contractDueDate', financial.contractDueDate || '');
      setValue('intakeForm.financialInfo.contract', financial.contract || '');
      setValue('intakeForm.financialInfo.cameFromReferral', financial.cameFromReferral || '');
      setValue('intakeForm.financialInfo.referralPerson', financial.referralPerson || '');
      setValue('intakeForm.financialInfo.otherObservations', financial.otherObservations || '');
      setValue('intakeForm.preferencesInfo.hasChildren', preferences.hasChildren || '');
      setValue('intakeForm.preferencesInfo.childrenCount', preferences.childrenCount || '');
      const legacyMarketingConsent = preferences.marketingConsent || '';
      setValue('intakeForm.preferencesInfo.marketingConsent', legacyMarketingConsent);
      setValue('intakeForm.preferencesInfo.servicePackagesConsent', preferences.servicePackagesConsent || legacyMarketingConsent);
      setValue('intakeForm.preferencesInfo.serviceFeedbackConsent', preferences.serviceFeedbackConsent || legacyMarketingConsent);
      setValue('intakeForm.preferencesInfo.promotionsConsent', preferences.promotionsConsent || legacyMarketingConsent);
      setValue('intakeForm.preferencesInfo.campaignsConsent', preferences.campaignsConsent || legacyMarketingConsent);
      setValue('intakeForm.preferencesInfo.shirtModel', preferences.shirtModel || '');
      setValue('intakeForm.preferencesInfo.shirtSize', preferences.shirtSize || '');
      setValue('intakeForm.preferencesInfo.clothingSize', preferences.clothingSize || '');
      setValue('intakeForm.preferencesInfo.shoeSize', preferences.shoeSize || '');
      setValue('intakeForm.preferencesInfo.favoriteMusicGenre', preferences.favoriteMusicGenre || '');
      setValue('intakeForm.preferencesInfo.favoriteChocolate', preferences.favoriteChocolate || '');
      setValue('intakeForm.preferencesInfo.preferredNickname', preferences.preferredNickname || '');
      setValue('intakeForm.parqResponses.q1', aluno.intakeForm?.parqResponses?.q1 ?? false);
      setValue('intakeForm.parqResponses.q2', aluno.intakeForm?.parqResponses?.q2 ?? false);
      setValue('intakeForm.parqResponses.q3', aluno.intakeForm?.parqResponses?.q3 ?? false);
      setValue('intakeForm.parqResponses.q4', aluno.intakeForm?.parqResponses?.q4 ?? false);
      setValue('intakeForm.parqResponses.q5', aluno.intakeForm?.parqResponses?.q5 ?? false);
      setValue('intakeForm.parqResponses.q6', aluno.intakeForm?.parqResponses?.q6 ?? false);
      setValue('intakeForm.parqResponses.q7', aluno.intakeForm?.parqResponses?.q7 ?? false);
      setValue('intakeForm.parqResponses.q8', aluno.intakeForm?.parqResponses?.q8 ?? false);
      Object.keys(defaultAhaResponses).forEach((key) => {
        setValue(
          `intakeForm.ahaResponses.${key}` as `intakeForm.ahaResponses.${string}`,
          formResponses.ahaResponses?.[key] === true
            ? 'yes'
            : formResponses.ahaResponses?.[key] === false
              ? 'no'
              : formResponses.ahaResponses?.[key] === 'yes' ||
                  formResponses.ahaResponses?.[key] === 'no' ||
                  formResponses.ahaResponses?.[key] === 'unknown'
                ? (formResponses.ahaResponses[key] as z.infer<typeof ahaResponseSchema>)
                : ''
        );
      });
    } catch (error) {
      console.error('Erro ao carregar aluno:', error);
      alert(alunoFormCopy.loadError);
      navigate('/alunos');
    } finally {
      setLoadingData(false);
    }
  };

  const onSubmit = async (data: AlunoFormData) => {
    setLoading(true);
    try {
      const resolvedAge = calculateAgeFromBirthDate(data.birthDate) ?? data.age;

      const parqResponses = {
        q1: data.intakeForm.parqResponses.q1,
        q2: data.intakeForm.parqResponses.q2,
        q3: data.intakeForm.parqResponses.q3,
        q4: data.intakeForm.parqResponses.q4,
        q5: data.intakeForm.parqResponses.q5,
        q6: data.intakeForm.parqResponses.q6,
        q7: data.intakeForm.parqResponses.q7,
        q8: data.intakeForm.parqResponses.q8,
      };
      const formResponses = {
        identification: data.intakeForm.personalInfo,
        financial: {
          ...data.intakeForm.financialInfo,
          contractDueDate:
            calculateContractDueDate(
              data.intakeForm.financialInfo.contractStartDate,
              data.intakeForm.financialInfo.contractDurationUnit,
              data.intakeForm.financialInfo.contractDurationQuantity
            ) || data.intakeForm.financialInfo.contractDueDate,
        },
        preferences: data.intakeForm.preferencesInfo,
        parqResponses,
        ahaResponses: data.intakeForm.ahaResponses,
      };

      const updatePayload: UpdateAlunoDTO = {
        avatar: data.avatar || undefined,
        serviceId: data.serviceId,
        birthDate: data.birthDate || undefined,
        gender: data.gender,
        schedulePlan: data.schedulePlan,
        age: resolvedAge,
        weight: data.weight,
        height: data.height,
        bodyFatPercentage: data.bodyFatPercentage,
        vo2Max: data.vo2Max,
        anaerobicThreshold: data.anaerobicThreshold,
        maxHeartRate: data.maxHeartRate,
        restingHeartRate: data.restingHeartRate,
        systolicPressure: data.systolicPressure,
        diastolicPressure: data.diastolicPressure,
        macronutrients: data.macronutrients,
        intakeForm: {
          assessmentDate: data.intakeForm.assessmentDate || undefined,
          mainGoal: data.intakeForm.mainGoal || undefined,
          medicalHistory: data.intakeForm.medicalHistory || undefined,
          currentMedications: data.intakeForm.currentMedications || undefined,
          injuriesHistory: data.intakeForm.injuriesHistory || undefined,
          trainingBackground: data.intakeForm.trainingBackground || undefined,
          observations: data.intakeForm.observations || undefined,
          parqResponses,
          formResponses,
        },
      };

      if (isEditMode && id) {
        await alunoService.update(id, updatePayload);
        alert(alunoFormCopy.updateSuccess);
        navigate(`/alunos/${id}`);
        return;
      }

      const createPayload: CreateAlunoDTO = {
        name: data.name,
        email: data.email,
        avatar: data.avatar || undefined,
        phone: data.phone,
        serviceId: data.serviceId,
        birthDate: data.birthDate || undefined,
        gender: data.gender,
        schedulePlan: data.schedulePlan,
        age: resolvedAge,
        weight: data.weight,
        height: data.height,
        bodyFatPercentage: data.bodyFatPercentage,
        vo2Max: data.vo2Max,
        anaerobicThreshold: data.anaerobicThreshold,
        maxHeartRate: data.maxHeartRate,
        restingHeartRate: data.restingHeartRate,
        systolicPressure: data.systolicPressure,
        diastolicPressure: data.diastolicPressure,
        macronutrients: data.macronutrients,
        intakeForm: {
          assessmentDate: data.intakeForm.assessmentDate || undefined,
          mainGoal: data.intakeForm.mainGoal || undefined,
          medicalHistory: data.intakeForm.medicalHistory || undefined,
          currentMedications: data.intakeForm.currentMedications || undefined,
          injuriesHistory: data.intakeForm.injuriesHistory || undefined,
          trainingBackground: data.intakeForm.trainingBackground || undefined,
          observations: data.intakeForm.observations || undefined,
          parqResponses,
          formResponses,
        },
      };

      const createdAluno = await alunoService.create(createPayload);
      navigate(`/alunos/${createdAluno.aluno.id}`, {
        state: { tempPassword: createdAluno.tempPassword },
      });
    } catch (error: any) {
      console.error('Erro ao salvar aluno:', error);
      alert(error.response?.data?.error || alunoFormCopy.saveError);
    } finally {
      setLoading(false);
    }
  };

  const handleInvalidSubmit = (formErrors: FieldErrors<AlunoFormData>) => {
    const hasIdentificationTabErrors =
      !!formErrors.name ||
      !!formErrors.email ||
      !!formErrors.avatar ||
      !!formErrors.phone ||
      !!formErrors.serviceId ||
      !!formErrors.birthDate ||
      !!formErrors.gender ||
      !!formErrors.schedulePlan ||
      !!formErrors.age;

    const hasAssessmentTabErrors =
      !!formErrors.weight ||
      !!formErrors.height ||
      !!formErrors.bodyFatPercentage ||
      !!formErrors.vo2Max ||
      !!formErrors.anaerobicThreshold ||
      !!formErrors.maxHeartRate ||
      !!formErrors.restingHeartRate ||
      !!formErrors.systolicPressure ||
      !!formErrors.diastolicPressure ||
      !!formErrors.macronutrients ||
      !!formErrors.intakeForm?.assessmentDate;

    if (
      hasIdentificationTabErrors ||
      formErrors.intakeForm?.personalInfo
    ) {
      setActiveTab('anamneseInicial');
      return;
    }

    if (hasAssessmentTabErrors) {
      setActiveTab('identificacao');
      return;
    }

    if (formErrors.intakeForm?.financialInfo) {
      setActiveTab('financeiro');
      return;
    }

    if (formErrors.intakeForm?.preferencesInfo) {
      setActiveTab('preferencias');
      return;
    }

    if (formErrors.intakeForm?.parqResponses) {
      setActiveTab('parq');
      return;
    }

    if (formErrors.intakeForm) {
      setActiveTab('aha');
    }
  };

  if (loadingData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">{alunoFormCopy.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/alunos')}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{isEditMode ? alunoFormCopy.editTitle : alunoFormCopy.newTitle}</h1>
          <p className="mt-2 text-muted-foreground">
            {isEditMode
              ? alunoFormCopy.editDescription
              : alunoFormCopy.newDescription}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)} className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-0 border-b border-border p-0">
            <div className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Cadastro do aluno</CardTitle>
                <CardDescription>Organize a identificação e os questionários clínicos por guia.</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIsPrefillModalOpen(true)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={alunoFormCopy.pdfTitle}
                title={alunoFormCopy.pdfTitle}
              >
                <Upload size={18} />
              </Button>
            </div>

            <div className="overflow-x-auto bg-muted/30 px-4 py-2">
              <div role="tablist" aria-label="Guias do cadastro do aluno" className="flex min-w-max gap-2">
                <button
                  type="button"
                  role="tab"
                  id="aluno-tab-anamnese-inicial"
                  aria-controls="aluno-panel-anamnese-inicial"
                  onClick={() => setActiveTab('anamneseInicial')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                    activeTab === 'anamneseInicial'
                      ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                  }`}
                >
                  <User size={16} />
                  Identificação
                </button>
                <button
                  type="button"
                  role="tab"
                  id="aluno-tab-parq"
                  aria-controls="aluno-panel-parq"
                  onClick={() => setActiveTab('parq')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                    activeTab === 'parq'
                      ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                  }`}
                >
                  <ClipboardList size={16} />
                  Questionário "PARQ"
                </button>
                <button
                  type="button"
                  role="tab"
                  id="aluno-tab-aha"
                  aria-controls="aluno-panel-aha"
                  onClick={() => setActiveTab('aha')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                    activeTab === 'aha'
                      ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                  }`}
                >
                  <HeartPulse size={16} />
                  Questionário American Heart Association
                </button>
                <button
                  type="button"
                  role="tab"
                  id="aluno-tab-financeiro"
                  aria-controls="aluno-panel-financeiro"
                  onClick={() => setActiveTab('financeiro')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                    activeTab === 'financeiro'
                      ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                  }`}
                >
                  <Wallet size={16} />
                  Financeiro
                </button>
                <button
                  type="button"
                  role="tab"
                  id="aluno-tab-preferencias"
                  aria-controls="aluno-panel-preferencias"
                  onClick={() => setActiveTab('preferencias')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                    activeTab === 'preferencias'
                      ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                  }`}
                >
                  <Sparkles size={16} />
                  Preferências
                </button>
                <button
                  type="button"
                  role="tab"
                  id="aluno-tab-identificacao"
                  aria-controls="aluno-panel-identificacao"
                  onClick={() => setActiveTab('identificacao')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                    activeTab === 'identificacao'
                      ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                  }`}
                >
                  <FileText size={16} />
                  Anamnese Inicial
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {activeTab === 'anamneseInicial' && (
              <div
                id="aluno-panel-anamnese-inicial"
                role="tabpanel"
                aria-labelledby="aluno-tab-anamnese-inicial"
                className="space-y-8"
              >
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Identificação</h2>
                    <p className="text-sm text-muted-foreground">Dados fixos do aluno que devem permanecer no cadastro principal.</p>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
                    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Dados principais</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Informações centrais para identificar e contatar o aluno.</p>
                      </div>

                      <Input label="Nome completo" placeholder="João Silva" error={errors.name?.message} disabled={isEditMode} {...register('name')} />

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input label="E-mail" type="email" placeholder="joao@email.com" error={errors.email?.message} disabled={isEditMode} {...register('email')} />
                        <Input
                          label="Telefone"
                          type="tel"
                          placeholder="(11) 99999-9999"
                          error={errors.phone?.message}
                          disabled={isEditMode}
                          {...register('phone', {
                            onChange: (event) => {
                              const formatted = formatPhone(event.target.value);
                              setValue('phone', formatted, { shouldValidate: true });
                            },
                          })}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input label="Data de Nascimento" type="date" error={errors.birthDate?.message} {...register('birthDate')} />
                        <div>
                          <label className="mb-2 block text-sm font-medium text-foreground">Gênero</label>
                          <select className={selectClassName} {...register('gender')}>
                            <option value="male">Masculino</option>
                            <option value="female">Feminino</option>
                            <option value="other">Outro</option>
                          </select>
                        </div>
                        <Input
                          label="Idade"
                          type="number"
                          placeholder="30"
                          error={errors.age?.message}
                          readOnly={calculatedAge !== undefined}
                          className={calculatedAge !== undefined ? 'bg-muted' : undefined}
                          {...register('age', { valueAsNumber: true })}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                          <div className="mx-auto flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/20 text-3xl font-semibold text-foreground">
                            {resolvedAvatar ? (
                              <img src={resolvedAvatar} alt={studentName || 'Aluno'} className="h-full w-full object-cover" />
                            ) : (
                              <span>{getAvatarInitials(studentName)}</span>
                            )}
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <h3 className="text-sm font-semibold text-foreground">Foto do aluno</h3>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Envie uma imagem para facilitar a identificação visual no cadastro e nas consultas.
                              </p>
                            </div>
                            <input
                              ref={avatarInputRef}
                              type="file"
                              accept="image/*"
                              aria-label="Selecionar foto do aluno"
                              title="Selecionar foto do aluno"
                              className="hidden"
                              onChange={handleAvatarUpload}
                            />
                            <div className="flex flex-wrap gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={avatarUploading}
                              >
                                <Upload size={16} />
                                {avatarUploading ? 'Enviando foto...' : resolvedAvatar ? 'Trocar foto' : 'Enviar foto'}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Formatos de imagem comuns são aceitos, com limite de até 5 MB.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Interesse e agenda</h3>
                          <p className="mt-1 text-sm text-muted-foreground">Defina o serviço de entrada e o modelo de agenda do aluno.</p>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-foreground">
                              Serviço de Interesse <span className="ml-1 text-destructive">*</span>
                            </label>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Selecione o serviço que motivou o cadastro inicial do aluno.
                            </p>
                          </div>

                          {servicesLoading ? (
                            <p className="text-sm text-muted-foreground">Carregando serviços...</p>
                          ) : servicesError ? (
                            <p className="text-sm text-destructive">{servicesError}</p>
                          ) : interestServiceOptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum serviço ativo cadastrado em Configurações &gt; Serviços.</p>
                          ) : (
                            <div>
                              <select className={selectClassName} {...register('serviceId')}>
                                <option value="">Selecione um serviço</option>
                                {interestServiceOptions.map((service) => (
                                  <option key={service.id} value={service.id}>
                                    {service.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {errors.serviceId?.message && (
                            <p className="text-sm text-destructive">{errors.serviceId.message}</p>
                          )}
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-foreground">Plano de agenda do aluno</label>
                          <select className={selectClassName} {...register('schedulePlan')}>
                            <option value="free">Livre</option>
                            <option value="fixed">Fixo</option>
                          </select>
                          <p className="mt-2 text-sm text-muted-foreground">Use plano fixo para alunos com rotina recorrente de agenda e reposições vinculadas.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Documentação e contato social</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Agrupe documentos civis e o principal canal social em um mesmo bloco.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Input label="CPF" placeholder="000.000.000-00" {...register('intakeForm.personalInfo.cpf')} />
                      <Input label="RG" placeholder="00.000.000-0" {...register('intakeForm.personalInfo.rg')} />
                      <Input label="Estado civil" placeholder="Solteiro(a), casado(a)..." {...register('intakeForm.personalInfo.maritalStatus')} />
                      <Input label="Rede social" placeholder="Ex.: @usuario, Instagram, TikTok" {...register('intakeForm.personalInfo.instagram')} />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Organize os dados residenciais em uma leitura mais compacta.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_160px]">
                      <Input label="Endereço" placeholder="Rua, avenida, rodovia..." {...register('intakeForm.personalInfo.address')} />
                      <Input label="Número" placeholder="123" {...register('intakeForm.personalInfo.addressNumber')} />
                    </div>

                    <Input label="Bairro" placeholder="Centro" {...register('intakeForm.personalInfo.neighborhood')} />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_180px]">
                      <Input label="Cidade" placeholder="São Paulo" {...register('intakeForm.personalInfo.city')} />
                      <Input label="Estado" placeholder="SP" {...register('intakeForm.personalInfo.state')} />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
                      <Input label="Complemento" placeholder="Bloco, apartamento, referência..." {...register('intakeForm.personalInfo.addressComplement')} />
                      <Input label="CEP" placeholder="00000-000" {...register('intakeForm.personalInfo.zipCode')} />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Contato de emergência</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Mantenha uma referência rápida de quem deve ser acionado em caso de necessidade.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Nome completo do contato de emergência"
                        placeholder="Nome e sobrenome"
                        {...register('intakeForm.personalInfo.emergencyContactName')}
                      />
                      <Input
                        label="Telefone do contato de emergência"
                        type="tel"
                        placeholder="(11) 99999-9999"
                        {...register('intakeForm.personalInfo.emergencyContactPhone', {
                          onChange: (event) => {
                            const formatted = formatPhone(event.target.value);
                            setValue('intakeForm.personalInfo.emergencyContactPhone', formatted, { shouldValidate: true });
                          },
                        })}
                      />
                    </div>

                    <Input
                      label="Relação com o paciente do contato de emergência"
                      placeholder="Mãe, pai, cônjuge, irmão, responsável..."
                      {...register('intakeForm.personalInfo.emergencyContactRelationship')}
                    />
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'financeiro' && (
              <div
                id="aluno-panel-financeiro"
                role="tabpanel"
                aria-labelledby="aluno-tab-financeiro"
                className="space-y-8"
              >
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Financeiro</h2>
                    <p className="text-sm text-muted-foreground">Centralize condições comerciais, vínculo atual e notas administrativas do aluno.</p>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Oferta e vínculo comercial</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Defina o serviço vigente, registre exceções comerciais e mantenha a referência contratual do aluno.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Serviço Vigente</label>
                        {servicesLoading ? (
                          <p className="text-sm text-muted-foreground">Carregando serviços...</p>
                        ) : servicesError ? (
                          <p className="text-sm text-destructive">{servicesError}</p>
                        ) : financialServiceOptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma oferta financeira ativa cadastrada em Configurações &gt; Serviços.</p>
                        ) : (
                          <>
                            <select
                              className={selectClassName}
                              {...register('intakeForm.financialInfo.currentService', {
                                onChange: (event) => {
                                  const selectedService = financialServiceOptions.find(
                                    (service) => service.name === event.target.value
                                  );

                                  if (selectedService?.monthlyPrice !== null && selectedService?.monthlyPrice !== undefined) {
                                    setValue(
                                      'intakeForm.financialInfo.monthlyValue',
                                      formatCurrencyValue(selectedService.monthlyPrice),
                                      { shouldValidate: true }
                                    );
                                  }
                                },
                              })}
                            >
                              <option value="">Selecione uma oferta financeira</option>
                              {financialServiceOptions.map((service) => (
                                <option key={service.id} value={service.name}>
                                  {service.parentService?.name ? `${service.parentService.name} • ${service.name}` : service.name}
                                </option>
                              ))}
                            </select>

                            {selectedFinancialService && (
                              <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                                <p>
                                  {selectedFinancialService.parentService?.name
                                    ? `Serviço base: ${selectedFinancialService.parentService.name}. `
                                    : ''}
                                  {selectedFinancialService.monthlyPrice !== null && selectedFinancialService.monthlyPrice !== undefined
                                    ? `Valor de referência: R$ ${formatCurrencyValue(selectedFinancialService.monthlyPrice)}. `
                                    : ''}
                                  {selectedFinancialService.validFrom || selectedFinancialService.validUntil
                                    ? `Vigência: ${selectedFinancialService.validFrom ? formatDateLabel(selectedFinancialService.validFrom) : 'início não informado'}${selectedFinancialService.validUntil ? ` até ${formatDateLabel(selectedFinancialService.validUntil)}` : ''}.`
                                    : ''}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="space-y-4">
                        <Input
                          label="Condição Especial"
                          placeholder="Ex.: bolsa parcial, desconto familiar, cortesia"
                          {...register('intakeForm.financialInfo.specialCondition')}
                        />
                        <Input
                          label="Contrato"
                          placeholder="Ex.: contrato anual, mensal recorrente, pacote promocional"
                          {...register('intakeForm.financialInfo.contract')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Cobrança</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Organize valores, desconto, datas e responsável financeiro em uma única leitura operacional.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <Input
                        label="Valor Mensal"
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        {...register('intakeForm.financialInfo.monthlyValue', {
                          onChange: (event) => {
                            const formatted = formatCurrencyInput(event.target.value);
                            setValue('intakeForm.financialInfo.monthlyValue', formatted, { shouldValidate: true });
                          },
                        })}
                      />
                      <Input
                        label="Desconto (%)"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        {...register('intakeForm.financialInfo.discountPercentage', {
                          onChange: (event) => {
                            const formatted = formatPercentageInput(event.target.value);
                            setValue('intakeForm.financialInfo.discountPercentage', formatted, { shouldValidate: true });
                          },
                        })}
                      />
                      <Input
                        label="Valor com Desconto"
                        type="text"
                        value={discountedMonthlyValue}
                        readOnly
                        disabled
                      />
                      <Input
                        label="Data de Início do Contrato"
                        type="date"
                        {...register('intakeForm.financialInfo.contractStartDate')}
                      />
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Duração do contrato</label>
                        <select className={selectClassName} {...register('intakeForm.financialInfo.contractDurationUnit')}>
                          <option value="">Selecione</option>
                          <option value="days">Dias</option>
                          <option value="months">Meses</option>
                          <option value="years">Anos</option>
                        </select>
                      </div>
                      <Input
                        label="Quantidade"
                        type="text"
                        inputMode="numeric"
                        placeholder="Ex.: 6"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                          }
                        }}
                        {...register('intakeForm.financialInfo.contractDurationQuantity', {
                          onChange: (event) => {
                            const normalized = normalizeDurationQuantity(event.target.value);
                            setValue('intakeForm.financialInfo.contractDurationQuantity', normalized, { shouldValidate: true });
                          },
                        })}
                      />
                      <Input
                        label="Vencimento do Contrato"
                        type="date"
                        value={calculatedContractDueDate}
                        readOnly
                        disabled
                      />
                      <Input
                        label="Dia de pagamento"
                        type="text"
                        inputMode="numeric"
                        placeholder="10"
                        {...register('intakeForm.financialInfo.paymentDay', {
                          onChange: (event) => {
                            const normalized = normalizePaymentDay(event.target.value);
                            setValue('intakeForm.financialInfo.paymentDay', normalized, { shouldValidate: true });
                          },
                        })}
                      />
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Professor Responsável</label>
                        {professorsLoading ? (
                          <p className="text-sm text-muted-foreground">Carregando professores...</p>
                        ) : professorsError ? (
                          <p className="text-sm text-destructive">{professorsError}</p>
                        ) : (
                          <select
                            className={selectClassName}
                            {...register('intakeForm.financialInfo.responsibleProfessorId', {
                              onChange: (event) => {
                                const selectedProfessor = professorOptions.find(
                                  (professor) => professor.id === event.target.value
                                );
                                setValue(
                                  'intakeForm.financialInfo.responsibleProfessorName',
                                  selectedProfessor?.user.profile.name || '',
                                  { shouldValidate: true }
                                );
                              },
                            })}
                          >
                            <option value="">Selecione um professor</option>
                            {professorOptions.map((professor) => (
                              <option key={professor.id} value={professor.id}>
                                {professor.user.profile.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Origem e observações</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Registre a origem comercial do aluno e mantenha o contexto administrativo associado ao cadastro.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Veio por alguma indicação?</label>
                        <select className={selectClassName} {...register('intakeForm.financialInfo.cameFromReferral')}>
                          <option value="">Não informar</option>
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </div>
                      <Input
                        label="Quem indicou?"
                        placeholder="Nome de quem indicou o aluno"
                        disabled={cameFromReferral !== 'yes'}
                        {...register('intakeForm.financialInfo.referralPerson')}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Outras observações</label>
                      <textarea
                        className={textareaClassName}
                        placeholder="Registre regras de cobrança, exceções combinadas ou contexto administrativo relevante"
                        {...register('intakeForm.financialInfo.otherObservations')}
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'preferencias' && (
              <div
                id="aluno-panel-preferencias"
                role="tabpanel"
                aria-labelledby="aluno-tab-preferencias"
                className="space-y-8"
              >
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Preferências</h2>
                    <p className="text-sm text-muted-foreground">Informações opcionais de perfil, comunicação e personalização do aluno.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Tem filhos?</label>
                      <select className={selectClassName} {...register('intakeForm.preferencesInfo.hasChildren')}>
                        <option value="">Não informar</option>
                        <option value="yes">Sim</option>
                        <option value="no">Não</option>
                      </select>
                    </div>
                    <Input
                      label="Quantos filhos?"
                      type="text"
                      inputMode="numeric"
                      placeholder="Ex.: 2"
                      {...register('intakeForm.preferencesInfo.childrenCount')}
                    />
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Comunicação da Acesso</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Permita respostas diferentes para cada tipo de contato.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Gostaria de receber mensagens sobre pacotes de serviços?
                        </label>
                        <select className={selectClassName} {...register('intakeForm.preferencesInfo.servicePackagesConsent')}>
                          <option value="">Não informar</option>
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Gostaria de receber mensagens sobre feedback de serviços?
                        </label>
                        <select className={selectClassName} {...register('intakeForm.preferencesInfo.serviceFeedbackConsent')}>
                          <option value="">Não informar</option>
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Gostaria de receber mensagens sobre promoções?
                        </label>
                        <select className={selectClassName} {...register('intakeForm.preferencesInfo.promotionsConsent')}>
                          <option value="">Não informar</option>
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Gostaria de receber mensagens sobre campanhas?
                        </label>
                        <select className={selectClassName} {...register('intakeForm.preferencesInfo.campaignsConsent')}>
                          <option value="">Não informar</option>
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Camiseta</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Separe o modelo da peça do tamanho para evitar ambiguidades no cadastro.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Modelo da camiseta</label>
                        <select className={selectClassName} {...register('intakeForm.preferencesInfo.shirtModel')}>
                          <option value="">Não informar</option>
                          <option value="traditional">Camiseta tradicional</option>
                          <option value="babylook">Baby Look</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Tamanho da camiseta</label>
                        <select className={selectClassName} {...register('intakeForm.preferencesInfo.shirtSize')}>
                          <option value="">Não informar</option>
                          <option value="PP">PP</option>
                          <option value="P">P</option>
                          <option value="M">M</option>
                          <option value="G">G</option>
                          <option value="GG">GG</option>
                          <option value="XGG">XGG</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input
                      label="Qual tamanho de calça, bermuda ou shorts você usa?"
                      placeholder="Ex.: 40, M, G"
                      {...register('intakeForm.preferencesInfo.clothingSize')}
                    />
                    <Input
                      label="Qual tamanho de calçado você usa?"
                      placeholder="Ex.: 38"
                      {...register('intakeForm.preferencesInfo.shoeSize')}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input
                      label="Qual gênero de música é o seu favorito para treinar?"
                      placeholder="Ex.: pop, rock, eletrônico, gospel"
                      {...register('intakeForm.preferencesInfo.favoriteMusicGenre')}
                    />
                    <Input
                      label="Qual o seu tipo de chocolate favorito?"
                      placeholder="Ex.: ao leite, meio amargo, branco"
                      {...register('intakeForm.preferencesInfo.favoriteChocolate')}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input
                      label="Nome ou apelido desejado para personalização de brindes e produtos"
                      placeholder="Ex.: Ju, João Silva, JS"
                      {...register('intakeForm.preferencesInfo.preferredNickname')}
                    />
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'identificacao' && (
              <div
                id="aluno-panel-identificacao"
                role="tabpanel"
                aria-labelledby="aluno-tab-identificacao"
                className="space-y-8"
              >
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Anamnese Inicial</h2>
                    <p className="text-sm text-muted-foreground">Objetivos, histórico, medicações, lesões e observações gerais da seção inicial.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Objetivo principal</label>
                      <textarea className={textareaClassName} placeholder="Ex.: melhorar performance, reduzir gordura, retornar ao treino" {...register('intakeForm.mainGoal')} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Histórico de treino e atividade física</label>
                      <textarea className={textareaClassName} placeholder="Descreva frequência, modalidades e experiência prévia" {...register('intakeForm.trainingBackground')} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Histórico médico</label>
                      <textarea className={textareaClassName} placeholder="Condições clínicas relevantes, cirurgias ou observações" {...register('intakeForm.medicalHistory')} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Medicações em uso</label>
                      <textarea className={textareaClassName} placeholder="Medicações contínuas ou recentes" {...register('intakeForm.currentMedications')} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Lesões e restrições</label>
                      <textarea className={textareaClassName} placeholder="Lesões anteriores, dores recorrentes e limitações" {...register('intakeForm.injuriesHistory')} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Observações do profissional</label>
                      <textarea className={textareaClassName} placeholder="Observações complementares da avaliação inicial" {...register('intakeForm.observations')} />
                    </div>
                  </div>
                </section>

                <section className="space-y-4 border-t border-border pt-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Antropometria e composição corporal</h2>
                    <p className="text-sm text-muted-foreground">Campos iniciais do formulário físico usados no acompanhamento do aluno.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Input label="Peso (kg)" type="number" step="0.1" placeholder="70.5" error={errors.weight?.message} {...register('weight', { valueAsNumber: true })} />
                    <Input label="Altura (cm)" type="number" step="0.1" placeholder="175" error={errors.height?.message} {...register('height', { valueAsNumber: true })} />
                    <Input label="% Gordura Corporal" type="number" step="0.1" placeholder="15.5" error={errors.bodyFatPercentage?.message} {...register('bodyFatPercentage', { valueAsNumber: true })} />
                  </div>

                  {bmi > 0 && (
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <p className="text-sm font-medium">IMC Calculado</p>
                      <p className="text-2xl font-bold">{bmi.toFixed(1)}</p>
                      <p className="text-sm text-muted-foreground">{bmiClass}</p>
                    </div>
                  )}
                </section>

                <section className="space-y-4 border-t border-border pt-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Avaliação metabólica e cardiovascular</h2>
                    <p className="text-sm text-muted-foreground">Dados principais para prescrição e leitura inicial do aluno.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input label="VO2 Max (ml/kg/min)" type="number" step="0.1" placeholder="55.0" error={errors.vo2Max?.message} {...register('vo2Max', { valueAsNumber: true })} />
                    <Input label="Limiar anaeróbico (km/h)" type="number" step="0.1" placeholder="15.0" error={errors.anaerobicThreshold?.message} {...register('anaerobicThreshold', { valueAsNumber: true })} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input label="FC máxima (bpm)" type="number" placeholder="190" error={errors.maxHeartRate?.message} {...register('maxHeartRate', { valueAsNumber: true })} />
                    <Input label="FC Repouso (bpm)" type="number" placeholder="60" error={errors.restingHeartRate?.message} {...register('restingHeartRate', { valueAsNumber: true })} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Input label="Data da avaliação inicial" type="date" error={errors.intakeForm?.assessmentDate?.message} {...register('intakeForm.assessmentDate')} />
                    <Input label="Pressão sistólica (mmHg)" type="number" placeholder="120" error={errors.systolicPressure?.message} {...register('systolicPressure', { valueAsNumber: true })} />
                    <Input label="Pressão diastólica (mmHg)" type="number" placeholder="80" error={errors.diastolicPressure?.message} {...register('diastolicPressure', { valueAsNumber: true })} />
                  </div>
                </section>

                <section className="space-y-4 border-t border-border pt-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Aporte energético e macronutrientes</h2>
                    <p className="text-sm text-muted-foreground">Resumo nutricional do formulário inicial quando disponível.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Input label="Carboidratos (%)" type="number" step="0.1" placeholder="55" error={errors.macronutrients?.carbohydratesPercentage?.message} {...register('macronutrients.carbohydratesPercentage', { valueAsNumber: true })} />
                    <Input label="Proteínas (%)" type="number" step="0.1" placeholder="25" error={errors.macronutrients?.proteinsPercentage?.message} {...register('macronutrients.proteinsPercentage', { valueAsNumber: true })} />
                    <Input label="Lipídios (%)" type="number" step="0.1" placeholder="20" error={errors.macronutrients?.lipidsPercentage?.message} {...register('macronutrients.lipidsPercentage', { valueAsNumber: true })} />
                    <Input label="Kcal por dia" type="number" placeholder="2200" error={errors.macronutrients?.dailyCalories?.message} {...register('macronutrients.dailyCalories', { valueAsNumber: true })} />
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'parq' && (
              <div
                id="aluno-panel-parq"
                role="tabpanel"
                aria-labelledby="aluno-tab-parq"
                className="space-y-4"
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Questionário "PARQ"</h2>
                  <p className="text-sm text-muted-foreground">Questionário de prontidão para atividade física registrado junto ao cadastro.</p>
                </div>
                <div className="space-y-3">
                  {parqQuestions.map((question) => (
                    <label key={question.key} className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm">
                      <input type="checkbox" className="mt-1 h-4 w-4" {...register(`intakeForm.parqResponses.${question.key}` as const)} />
                      <span>{question.label}</span>
                    </label>
                  ))}
                </div>
                <div className="rounded-xl border border-[#e2e8f0] px-4 py-4">
                  <p className="text-sm leading-6 text-foreground">
                    <span className="font-semibold">DECLARAÇÃO DE RESPONSABILIDADE:</span> Assumo a veracidade das informações prestadas no questionário &quot;PAR-Q&quot;.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input
                        type="radio"
                        name="parq-declaration"
                        className="h-4 w-4"
                        checked={parqDeclarationAccepted === true}
                        onChange={() => setValue('intakeForm.parqResponses.q8', true, { shouldDirty: true, shouldTouch: true })}
                      />
                      <span>Sim</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input
                        type="radio"
                        name="parq-declaration"
                        className="h-4 w-4"
                        checked={parqDeclarationAccepted === false}
                        onChange={() => setValue('intakeForm.parqResponses.q8', false, { shouldDirty: true, shouldTouch: true })}
                      />
                      <span>Não</span>
                    </label>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Marque as respostas positivas. Se todas permanecerem desmarcadas, o aluno não sinalizou restrições no PAR-Q.</p>
              </div>
            )}

            {activeTab === 'aha' && (
              <div
                id="aluno-panel-aha"
                role="tabpanel"
                aria-labelledby="aluno-tab-aha"
                className="space-y-4"
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Questionário American Heart Association</h2>
                  <p className="text-sm text-muted-foreground">Selecione a resposta de cada pergunta usando as opções Sim, Não ou Não sei.</p>
                </div>

                <div className="space-y-5">
                  {ahaQuestionGroups.map((group) => (
                    <section key={group.title} className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                      <div className="space-y-3">
                        {group.questions.map((question) => (
                          <div key={question.key} className="grid gap-3 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_140px] md:items-center md:gap-4">
                            <label className="pr-2 text-sm leading-6 text-foreground">{question.label}</label>
                            <select
                              className={compactSelectClassName}
                              defaultValue=""
                              {...register(`intakeForm.ahaResponses.${question.key}` as `intakeForm.ahaResponses.${string}`)}
                            >
                              {ahaAnswerOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/alunos')}>
            {alunoFormCopy.cancel}
          </Button>
          <Button type="submit" isLoading={loading}>
            {isEditMode ? alunoFormCopy.updateAluno : alunoFormCopy.createAluno}
          </Button>
        </div>
      </form>

      {isPrefillModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsPrefillModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground shadow-[var(--shadow-card)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-6">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-semibold leading-tight tracking-tight">{alunoFormCopy.pdfTitle}</h2>
                <p className="text-sm text-muted-foreground">{alunoFormCopy.pdfDescription}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsPrefillModalOpen(false)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Fechar leitura de PDF"
              >
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">{alunoFormCopy.pdfFileLabel}</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    title={alunoFormCopy.pdfFileTitle}
                    className="flex h-12 w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base"
                    onChange={(event) => setPrefillFile(event.target.files?.[0] || null)}
                  />
                </div>
                <Button type="button" onClick={handleAssessmentPrefill} isLoading={prefillLoading}>
                  {alunoFormCopy.applyPrefill}
                </Button>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {alunoFormCopy.pdfHint}
              </div>
              {prefillSummary && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {prefillSummary}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

