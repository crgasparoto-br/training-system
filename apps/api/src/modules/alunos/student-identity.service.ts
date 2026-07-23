import { Prisma, PrismaClient, type StudentLifecycleEventType } from '@prisma/client';

const prisma = new PrismaClient();

type DbClient = Prisma.TransactionClient | PrismaClient;

type IdentityActor = {
  userId?: string;
  professorId?: string;
};

export interface StudentIdentityData {
  name?: string | null;
  email?: string | null;
  additionalEmail?: string | null;
  phone?: string | null;
  additionalPhone?: string | null;
  cpf?: string | null;
  birthDate?: string | Date | null;
  gender?: 'male' | 'female' | 'other' | null;
  rg?: string | null;
  maritalStatus?:
    | 'single'
    | 'married'
    | 'stable_union'
    | 'divorced'
    | 'separated'
    | 'widowed'
    | 'other'
    | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZipCode?: string | null;
  instagramHandle?: string | null;
  guardianName?: string | null;
  guardianCpf?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
}

export interface StudentIdentitySnapshot extends Omit<StudentIdentityData, 'birthDate'> {
  birthDate?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cleanText = (value?: string | null): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function normalizeStudentEmail(email?: string | null): string | undefined {
  const cleaned = cleanText(email);
  return typeof cleaned === 'string' ? cleaned.toLowerCase() : undefined;
}

export function normalizeStudentPhone(phone?: string | null): string | undefined {
  if (typeof phone !== 'string') return undefined;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

export function normalizeStudentCpf(cpf?: string | null): string | undefined {
  if (typeof cpf !== 'string') return undefined;
  const digits = cpf.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

export function deriveAgeFromBirthDate(
  birthDate: Date,
  referenceDate: Date = new Date()
): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age;
}

const toIsoDate = (value?: string | Date | null): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data de nascimento inválida');
  }
  return parsed.toISOString();
};

const buildLegacyFallback = (aluno: {
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  leadCpf: string | null;
  birthDate: Date | null;
  user: {
    email: string;
    profile: {
      name: string;
      phone: string | null;
      cpf: string | null;
      birthDate: Date | null;
      gender: StudentIdentityData['gender'];
      rg: string | null;
      maritalStatus: StudentIdentityData['maritalStatus'];
      addressStreet: string | null;
      addressNumber: string | null;
      addressComplement: string | null;
      addressNeighborhood: string | null;
      addressCity: string | null;
      addressState: string | null;
      addressZipCode: string | null;
      instagramHandle: string | null;
    } | null;
  } | null;
}): StudentIdentitySnapshot => ({
  name: aluno.leadName ?? aluno.user?.profile?.name ?? null,
  email: aluno.leadEmail ?? aluno.user?.email ?? null,
  additionalEmail: null,
  phone: aluno.leadPhone ?? aluno.user?.profile?.phone ?? null,
  additionalPhone: null,
  cpf: aluno.leadCpf ?? aluno.user?.profile?.cpf ?? null,
  birthDate:
    aluno.birthDate?.toISOString() ?? aluno.user?.profile?.birthDate?.toISOString() ?? null,
  gender: aluno.user?.profile?.gender ?? null,
  rg: aluno.user?.profile?.rg ?? null,
  maritalStatus: aluno.user?.profile?.maritalStatus ?? null,
  addressStreet: aluno.user?.profile?.addressStreet ?? null,
  addressNumber: aluno.user?.profile?.addressNumber ?? null,
  addressComplement: aluno.user?.profile?.addressComplement ?? null,
  addressNeighborhood: aluno.user?.profile?.addressNeighborhood ?? null,
  addressCity: aluno.user?.profile?.addressCity ?? null,
  addressState: aluno.user?.profile?.addressState ?? null,
  addressZipCode: aluno.user?.profile?.addressZipCode ?? null,
  instagramHandle: aluno.user?.profile?.instagramHandle ?? null,
});

const mergeIdentity = (
  current: StudentIdentitySnapshot,
  patch: StudentIdentityData
): StudentIdentitySnapshot => {
  const next: StudentIdentitySnapshot = { ...current };

  for (const [key, rawValue] of Object.entries(patch)) {
    if (rawValue === undefined) continue;

    if (key === 'birthDate') {
      next.birthDate = toIsoDate(rawValue as string | Date | null);
      continue;
    }

    if (typeof rawValue === 'string' || rawValue === null) {
      (next as Record<string, unknown>)[key] = cleanText(rawValue);
      continue;
    }

    (next as Record<string, unknown>)[key] = rawValue;
  }

  return next;
};

export async function loadStudentIdentity(
  alunoId: string,
  contractId: string,
  client: DbClient = prisma
): Promise<StudentIdentitySnapshot> {
  const aluno = await client.aluno.findFirst({
    where: { id: alunoId, contractId },
    include: {
      studentProfile: true,
      user: { include: { profile: true } },
    },
  });

  if (!aluno) {
    throw new Error('Registro não encontrado');
  }

  const stored = isRecord(aluno.studentProfile?.identificationData)
    ? (aluno.studentProfile!.identificationData as StudentIdentitySnapshot)
    : null;

  return stored ?? buildLegacyFallback(aluno);
}

const changedNormalizedFields = (
  aluno: {
    leadEmailNormalized: string | null;
    leadPhoneNormalized: string | null;
    leadCpfNormalized: string | null;
  },
  identity: StudentIdentitySnapshot
): Array<'email' | 'phone' | 'cpf'> => {
  const changes: Array<'email' | 'phone' | 'cpf'> = [];
  if (aluno.leadEmailNormalized !== (normalizeStudentEmail(identity.email) ?? null)) {
    changes.push('email');
  }
  if (aluno.leadPhoneNormalized !== (normalizeStudentPhone(identity.phone) ?? null)) {
    changes.push('phone');
  }
  if (aluno.leadCpfNormalized !== (normalizeStudentCpf(identity.cpf) ?? null)) {
    changes.push('cpf');
  }
  return changes;
};

/**
 * Atualiza a identidade tenant-scoped em uma única fronteira de escrita.
 *
 * `StudentProfile.identificationData` é a fonte canônica. Os campos `Aluno.lead*`
 * são projeções normalizadas para busca/constraints. `Profile` é atualizado apenas
 * como projeção legada temporária quando `syncLegacyProfile` estiver habilitado;
 * nenhum fluxo deve escrever esses campos diretamente fora deste service.
 *
 * A projeção em `Aluno` é atualizada antes de `StudentProfile`. Essa ordem é
 * intencional: fluxos públicos já bloqueiam o onboarding e depois escrevem Aluno
 * e identidade; fluxos administrativos normalmente bloqueiam Aluno primeiro. O
 * trigger de versão da identidade usa NOWAIT sobre o onboarding para transformar
 * uma disputa inversa em conflito transacional, nunca em deadlock.
 */
export async function upsertStudentIdentity(
  alunoId: string,
  contractId: string,
  patch: StudentIdentityData,
  options: {
    client?: DbClient;
    actor?: IdentityActor;
    sourceType?: 'student' | 'professional' | 'integration' | 'system';
    sourceReference?: string;
    syncLegacyProfile?: boolean;
    emitAuditEvent?: boolean;
  } = {}
): Promise<StudentIdentitySnapshot> {
  if (!options.client) {
    return prisma.$transaction((tx) =>
      upsertStudentIdentity(alunoId, contractId, patch, { ...options, client: tx })
    );
  }

  const client = options.client;
  const aluno = await client.aluno.findFirst({
    where: { id: alunoId, contractId },
    include: {
      studentProfile: true,
      user: { include: { profile: true } },
    },
  });

  if (!aluno) {
    throw new Error('Registro não encontrado');
  }

  const stored = isRecord(aluno.studentProfile?.identificationData)
    ? (aluno.studentProfile!.identificationData as StudentIdentitySnapshot)
    : buildLegacyFallback(aluno);
  const identity = mergeIdentity(stored, patch);
  const normalizedChanges = changedNormalizedFields(aluno, identity);
  const birthDate = identity.birthDate ? new Date(identity.birthDate) : null;

  await client.aluno.update({
    where: { id: alunoId },
    data: {
      leadName: cleanText(identity.name) ?? null,
      leadEmail: cleanText(identity.email) ?? null,
      leadEmailNormalized: normalizeStudentEmail(identity.email) ?? null,
      leadAdditionalEmail: cleanText(identity.additionalEmail) ?? null,
      leadAdditionalEmailNormalized: normalizeStudentEmail(identity.additionalEmail) ?? null,
      leadPhone: cleanText(identity.phone) ?? null,
      leadPhoneNormalized: normalizeStudentPhone(identity.phone) ?? null,
      leadAdditionalPhone: cleanText(identity.additionalPhone) ?? null,
      leadAdditionalPhoneNormalized: normalizeStudentPhone(identity.additionalPhone) ?? null,
      leadCpf: cleanText(identity.cpf) ?? null,
      leadCpfNormalized: normalizeStudentCpf(identity.cpf) ?? null,
      birthDate,
      age: birthDate ? deriveAgeFromBirthDate(birthDate) : null,
    },
  });

  await client.studentProfile.upsert({
    where: { alunoId },
    create: {
      alunoId,
      contractId,
      sourceType: options.sourceType ?? 'student',
      sourceReference: options.sourceReference,
      recordedByUserId: options.actor?.userId,
      identificationData: identity as Prisma.InputJsonValue,
    },
    update: {
      contractId,
      sourceType: options.sourceType ?? aluno.studentProfile?.sourceType ?? 'student',
      sourceReference: options.sourceReference ?? aluno.studentProfile?.sourceReference,
      recordedByUserId: options.actor?.userId ?? aluno.studentProfile?.recordedByUserId,
      identificationData: identity as Prisma.InputJsonValue,
    },
  });

  const legacyProjectionIsUnambiguous =
    options.syncLegacyProfile &&
    aluno.userId &&
    aluno.user?.profile &&
    (await client.aluno.count({ where: { userId: aluno.userId } })) === 1;

  if (legacyProjectionIsUnambiguous && aluno.userId && aluno.user?.profile) {
    await client.profile.update({
      where: { userId: aluno.userId },
      data: {
        name: cleanText(identity.name) ?? aluno.user.profile.name,
        phone: cleanText(identity.phone) ?? null,
        birthDate,
        gender: identity.gender ?? null,
        cpf: cleanText(identity.cpf) ?? null,
        rg: cleanText(identity.rg) ?? null,
        maritalStatus: identity.maritalStatus ?? null,
        addressStreet: cleanText(identity.addressStreet) ?? null,
        addressNumber: cleanText(identity.addressNumber) ?? null,
        addressComplement: cleanText(identity.addressComplement) ?? null,
        addressNeighborhood: cleanText(identity.addressNeighborhood) ?? null,
        addressCity: cleanText(identity.addressCity) ?? null,
        addressState: cleanText(identity.addressState) ?? null,
        addressZipCode: cleanText(identity.addressZipCode) ?? null,
        instagramHandle: cleanText(identity.instagramHandle) ?? null,
      },
    });
  }

  if (options.emitAuditEvent !== false && normalizedChanges.length > 0) {
    await client.studentLifecycleEvent.create({
      data: {
        alunoId,
        contractId,
        eventType: 'IDENTIFIER_NORMALIZED_CHANGED' as StudentLifecycleEventType,
        actorUserId: options.actor?.userId,
        actorProfessorId: options.actor?.professorId,
        metadata: { fields: normalizedChanges },
      },
    });
  }

  return identity;
}

const normalizeComparableText = (value?: string | null) =>
  cleanText(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function findStudentAccountIdentityMismatches(
  alunoId: string,
  contractId: string,
  userId: string,
  client: DbClient = prisma
): Promise<string[]> {
  const [identity, account] = await Promise.all([
    loadStudentIdentity(alunoId, contractId, client),
    client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    }),
  ]);

  if (!account || account.type !== 'aluno') {
    return ['account'];
  }

  const mismatches: string[] = [];
  if (
    identity.name &&
    account.profile?.name &&
    normalizeComparableText(identity.name) !== normalizeComparableText(account.profile.name)
  ) {
    mismatches.push('name');
  }
  if (
    identity.phone &&
    account.profile?.phone &&
    normalizeStudentPhone(identity.phone) !== normalizeStudentPhone(account.profile.phone)
  ) {
    mismatches.push('phone');
  }
  if (
    identity.cpf &&
    account.profile?.cpf &&
    normalizeStudentCpf(identity.cpf) !== normalizeStudentCpf(account.profile.cpf)
  ) {
    mismatches.push('cpf');
  }
  if (identity.birthDate && account.profile?.birthDate) {
    const accountDate = account.profile.birthDate.toISOString().slice(0, 10);
    const identityDate = new Date(identity.birthDate).toISOString().slice(0, 10);
    if (identityDate !== accountDate) mismatches.push('birthDate');
  }

  return mismatches;
}