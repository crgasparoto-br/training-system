import { Prisma, PrismaClient } from '@prisma/client';
import {
  PRE_REGISTRATION_ADMIN_STATUSES,
  type AccessDataScope,
  type CreatePreRegistrationLeadDTO,
  type PreRegistrationAdminAllowedActionsDTO,
  type PreRegistrationAdminInviteFilter,
  type PreRegistrationAdminLeadDetailDTO,
  type PreRegistrationAdminLeadSummaryDTO,
  type PreRegistrationAdminListQueryDTO,
  type PreRegistrationAdminListResultDTO,
  type PreRegistrationAdminNextActionDTO,
  type PreRegistrationAdminStatus,
  type PreRegistrationDuplicateCheckResultDTO,
  type PreRegistrationInviteStatus,
  type UpdatePreRegistrationLeadCommercialDTO,
} from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import {
  createStudentLead,
  discardStudentLead,
  findMissingPreRegistrationFields,
  markStudentReadyForEnrollment,
  reopenDiscardedStudentLead,
} from '../alunos/student-lifecycle.service.js';
import {
  loadStudentIdentity,
  normalizeStudentCpf,
  normalizeStudentEmail,
  normalizeStudentPhone,
  upsertStudentIdentity,
  type StudentIdentityData,
} from '../alunos/student-identity.service.js';
import { preRegistrationInviteAdminService } from '../pre-registration-invites/pre-registration-invite-admin.service.js';

const prisma = new PrismaClient();
const SCREEN_KEY = 'students.preRegistration';
const ACTIVE_STATUS = 'ACTIVE_STUDENT';
const MAX_PAGE_SIZE = 100;
const ADMIN_STATUSES = new Set<string>(PRE_REGISTRATION_ADMIN_STATUSES);
const INVITE_FILTERS = new Set<string>([
  'NONE',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'SUPERSEDED',
  'COMPLETED',
]);

const BLOCKS = {
  edit: 'students.preRegistration.editCommercial',
  invite: 'students.preRegistration.generateInvite',
  revoke: 'students.preRegistration.revokeInvite',
  review: 'students.preRegistration.review',
  discard: 'students.preRegistration.discardReopen',
  convert: 'students.preRegistration.convert',
} as const;

export class PreRegistrationAdminError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_INPUT'
      | 'POSSIBLE_DUPLICATE'
      | 'IDENTIFIER_CONFLICT'
      | 'PRECONDITION_FAILED'
      | 'ACTIVE_STUDENT',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PreRegistrationAdminError';
  }
}

export interface PreRegistrationAdminActor {
  userId?: string;
  professorId: string;
  contractId: string;
}

type AccessContext = {
  scope: AccessDataScope;
  visibleProfessorIds: string[];
  permissions: PreRegistrationAdminAllowedActionsDTO;
  canViewSensitiveContacts: boolean;
};

type CommercialMetadata = { notes?: string; unit?: string };
type DateRange = { gte?: Date; lte?: Date };

const leadInclude = Prisma.validator<Prisma.AlunoInclude>()({
  onboarding: true,
  studentProfile: true,
  professor: { include: { user: { include: { profile: true } } } },
  createdByProfessor: { include: { user: { include: { profile: true } } } },
  preRegistrationInvites: {
    where: { purpose: 'PRE_REGISTRATION' },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  parqSubmissions: {
    orderBy: { submittedAt: 'desc' },
    take: 1,
    select: {
      id: true,
      submittedAt: true,
      positiveItems: true,
      followUps: {
        where: { status: 'active' },
        select: { id: true },
        take: 1,
      },
    },
  },
});

type LeadRecord = Prisma.AlunoGetPayload<{ include: typeof leadInclude }>;
type InviteRecord = LeadRecord['preRegistrationInvites'][number];
type ProfessorRecord = NonNullable<LeadRecord['professor']>;

function clean(value?: string | null) {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function iso(value?: Date | null) {
  return value?.toISOString();
}

function parseDate(value?: string, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PreRegistrationAdminError('Período informado é inválido.', 'INVALID_INPUT');
  }
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

function dateRange(from?: string, to?: string): DateRange | undefined {
  const gte = parseDate(from);
  const lte = parseDate(to, true);
  if (gte && lte && gte > lte) {
    throw new PreRegistrationAdminError(
      'A data inicial não pode ser posterior à data final.',
      'INVALID_INPUT'
    );
  }
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined;
}

function nameOf(professor?: ProfessorRecord | null) {
  return professor?.user.profile?.name || professor?.user.email || 'Responsável sem nome';
}

function readCommercial(data: unknown): CommercialMetadata {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const value = (data as Record<string, unknown>)._leadCommercial;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    unit: typeof record.unit === 'string' ? record.unit : undefined,
  };
}

function identityPatch(
  currentIdentity: Record<string, unknown>,
  patch: UpdatePreRegistrationLeadCommercialDTO | CreatePreRegistrationLeadDTO
): StudentIdentityData {
  const current = readCommercial(currentIdentity);
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key);
  return {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.cpf !== undefined ? { cpf: patch.cpf } : {}),
    _leadCommercial: {
      notes: has('commercialNotes') ? clean(patch.commercialNotes) : current.notes,
      unit: has('unit') ? clean(patch.unit) : current.unit,
    },
  } as unknown as StudentIdentityData;
}

function maskPhone(value?: string | null) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

function maskEmail(value?: string | null) {
  if (!value) return undefined;
  const [local, domain] = value.split('@');
  if (!domain) return '••••';
  return `${local?.slice(0, 1) || '•'}•••@${domain}`;
}

function maskCpf(value?: string | null) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 2 ? `•••.•••.•••-${digits.slice(-2)}` : '•••.•••.•••-••';
}

async function accessFor(actor: PreRegistrationAdminActor): Promise<AccessContext> {
  const professor = await prisma.professor.findFirst({
    where: { id: actor.professorId, contractId: actor.contractId },
    select: {
      id: true,
      role: true,
      collaboratorFunction: { select: { id: true, code: true } },
    },
  });
  if (!professor) {
    throw new PreRegistrationAdminError('Responsável não encontrado.', 'NOT_FOUND');
  }

  const accessProfessor = {
    role: professor.role as 'master' | 'professor',
    collaboratorFunction: professor.collaboratorFunction,
  };
  const [scope, edit, invite, revoke, review, discard, convert] = await Promise.all([
    getEffectiveDataScopeForProfessor(accessProfessor, SCREEN_KEY),
    canProfessorAccessBlock(accessProfessor, BLOCKS.edit),
    canProfessorAccessBlock(accessProfessor, BLOCKS.invite),
    canProfessorAccessBlock(accessProfessor, BLOCKS.revoke),
    canProfessorAccessBlock(accessProfessor, BLOCKS.review),
    canProfessorAccessBlock(accessProfessor, BLOCKS.discard),
    canProfessorAccessBlock(accessProfessor, BLOCKS.convert),
  ]);
  if (!scope) {
    throw new PreRegistrationAdminError('Perfil sem escopo para pré-matrículas.', 'FORBIDDEN');
  }

  const visible =
    scope === 'contract'
      ? await prisma.professor.findMany({
          where: { contractId: actor.contractId },
          select: { id: true },
        })
      : scope === 'managed'
        ? await prisma.professor.findMany({
            where: {
              contractId: actor.contractId,
              OR: [{ id: actor.professorId }, { responsibleManagerId: actor.professorId }],
            },
            select: { id: true },
          })
        : [{ id: actor.professorId }];

  const permissions = {
    canEditCommercialData: edit,
    canGenerateInvite: invite,
    canRegenerateInvite: invite,
    canRevokeInvite: revoke,
    canReview: review,
    canDiscard: discard,
    canReopen: discard,
    canConvert: convert,
    canOpenStudentCentral: true,
  };

  return {
    scope,
    visibleProfessorIds: visible.map((item) => item.id),
    permissions,
    canViewSensitiveContacts: edit || review || convert,
  };
}

function scopedWhere(access: AccessContext): Prisma.AlunoWhereInput {
  if (access.scope === 'contract') return {};
  return {
    OR: [
      { professorId: { in: access.visibleProfessorIds } },
      { createdByProfessorId: { in: access.visibleProfessorIds } },
    ],
  };
}

function isVisibleRow(
  row: { professorId: string | null; createdByProfessorId: string | null },
  access: AccessContext
) {
  return (
    access.scope === 'contract' ||
    (row.professorId ? access.visibleProfessorIds.includes(row.professorId) : false) ||
    (row.createdByProfessorId
      ? access.visibleProfessorIds.includes(row.createdByProfessorId)
      : false)
  );
}

function effectiveInviteStatus(invite?: InviteRecord): PreRegistrationInviteStatus | undefined {
  return invite?.status === 'ACTIVE' && invite.expiresAt <= new Date()
    ? 'EXPIRED'
    : invite?.status;
}

function inviteCapabilities(lead: LeadRecord, invite?: InviteRecord) {
  const status = effectiveInviteStatus(invite);
  const compatible = lead.status === 'LEAD' || lead.status === 'INVITED';
  return {
    canGenerateFirst: compatible && !invite,
    canRegenerate: compatible && status === 'ACTIVE',
    canRevoke: status === 'ACTIVE',
  };
}

function hasPositiveParqItems(value: Prisma.JsonValue | null | undefined) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(value);
}

function parqRequiresProfessionalReview(lead: LeadRecord) {
  const latest = lead.parqSubmissions[0];
  return Boolean(
    latest &&
      (hasPositiveParqItems(latest.positiveItems) || latest.followUps.length > 0)
  );
}

function progressOf(lead: LeadRecord) {
  const data = (lead.studentProfile?.identificationData || {}) as Record<string, unknown>;
  const missing = findMissingPreRegistrationFields({
    name: typeof data.name === 'string' ? data.name : lead.leadName || undefined,
    phone: typeof data.phone === 'string' ? data.phone : lead.leadPhone || undefined,
    birthDate:
      typeof data.birthDate === 'string' ? data.birthDate : lead.birthDate || undefined,
    privacyNoticeVersion: lead.onboarding?.privacyNoticeVersion || undefined,
    privacyAcceptedAt: lead.onboarding?.privacyAcceptedAt || undefined,
  });
  const totalFields = 5;
  return {
    basicRegistration: lead.onboarding?.completedAt
      ? 'COMPLETED'
      : lead.onboarding?.startedAt || lead.onboarding?.lastSavedAt
        ? 'IN_PROGRESS'
        : 'NOT_STARTED',
    healthModuleStatus: lead.onboarding?.healthModuleStatus || 'NOT_STARTED',
    parqModuleStatus: lead.onboarding?.parqModuleStatus || 'NOT_STARTED',
    parqRequiresProfessionalReview: parqRequiresProfessionalReview(lead),
    completedFields: Math.max(0, totalFields - missing.length),
    totalFields,
    missingRequiredFields: missing,
    startedAt: iso(lead.onboarding?.startedAt),
    lastSavedAt: iso(lead.onboarding?.lastSavedAt),
    completedAt: iso(lead.onboarding?.completedAt),
  } as const;
}

function allowedFor(lead: LeadRecord, invite: InviteRecord | undefined, access: AccessContext) {
  const inviteActions = inviteCapabilities(lead, invite);
  const discarded = lead.status === 'DISCARDED';
  return {
    canEditCommercialData: access.permissions.canEditCommercialData && !discarded,
    canGenerateInvite:
      access.permissions.canGenerateInvite && inviteActions.canGenerateFirst,
    canRegenerateInvite:
      access.permissions.canRegenerateInvite && inviteActions.canRegenerate,
    canRevokeInvite: access.permissions.canRevokeInvite && inviteActions.canRevoke,
    canReview:
      access.permissions.canReview && lead.status === 'PRE_REGISTRATION_COMPLETED',
    canDiscard: access.permissions.canDiscard && !discarded,
    canReopen: access.permissions.canReopen && discarded,
    canConvert:
      access.permissions.canConvert && lead.status === 'READY_FOR_ENROLLMENT',
    canOpenStudentCentral: false,
  };
}

function nextAction(
  lead: LeadRecord,
  invite: InviteRecord | undefined,
  allowed: PreRegistrationAdminAllowedActionsDTO,
  requiresParqReview: boolean
): PreRegistrationAdminNextActionDTO {
  if (lead.status === 'DISCARDED') {
    return {
      code: 'REOPEN',
      label: 'Reabrir lead',
      description: 'Retome o atendimento preservando o histórico.',
      enabled: allowed.canReopen,
    };
  }
  if (lead.status === 'LEAD') {
    return {
      code: 'CREATE_INVITE',
      label: 'Gerar link de pré-cadastro',
      description: 'Crie um link seguro para iniciar o preenchimento.',
      enabled: allowed.canGenerateInvite,
    };
  }
  if (lead.status === 'INVITED') {
    const active = effectiveInviteStatus(invite) === 'ACTIVE';
    return {
      code: active ? 'WAIT_FOR_ACCESS' : 'CREATE_INVITE',
      label: active ? 'Aguardar primeiro acesso' : 'Gerar novo link',
      description: active
        ? 'O convite está ativo e dentro do prazo.'
        : 'O convite anterior não está mais disponível.',
      enabled: active || allowed.canGenerateInvite,
    };
  }
  if (lead.status === 'PRE_REGISTRATION_IN_PROGRESS') {
    return {
      code: 'FOLLOW_UP_REGISTRATION',
      label: 'Acompanhar pendências',
      description: 'Oriente a conclusão dos campos pendentes.',
      enabled: true,
    };
  }
  if (lead.status === 'PRE_REGISTRATION_COMPLETED') {
    return {
      code: 'REVIEW_REGISTRATION',
      label: 'Revisar pré-matrícula',
      description: 'Confirme os dados básicos e a deduplicação.',
      enabled: allowed.canReview,
    };
  }
  if (lead.status === 'READY_FOR_ENROLLMENT' && requiresParqReview) {
    return {
      code: 'REVIEW_PARQ',
      label: 'Encaminhar análise profissional',
      description:
        'O PAR-Q contém alerta. A matrícula pode seguir, mas a análise profissional deve ser acompanhada.',
      enabled: true,
    };
  }
  if (lead.status === 'READY_FOR_ENROLLMENT') {
    return {
      code: 'WAIT_FOR_CONVERSION',
      label: 'Abrir fluxo de matrícula',
      description: 'O cadastro está pronto para contratação e ativação.',
      enabled: allowed.canConvert,
    };
  }
  return {
    code: 'NONE',
    label: 'Nenhuma ação pendente',
    description: 'Não há ação administrativa disponível.',
    enabled: false,
  };
}

function latestActivityAt(lead: LeadRecord) {
  const values = [
    lead.updatedAt,
    lead.onboarding?.lastSavedAt,
    lead.preRegistrationInvites[0]?.lastAccessAt,
    lead.preRegistrationInvites[0]?.createdAt,
    lead.parqSubmissions[0]?.submittedAt,
  ].filter((value): value is Date => Boolean(value));
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

function contactsOf(lead: LeadRecord, reveal: boolean) {
  if (reveal) {
    return {
      phone: lead.leadPhone || undefined,
      email: lead.leadEmail || undefined,
      cpf: lead.leadCpf || undefined,
      masked: false,
    };
  }
  return {
    phone: maskPhone(lead.leadPhone),
    email: maskEmail(lead.leadEmail),
    cpf: maskCpf(lead.leadCpf),
    masked: true,
  };
}

function summaryOf(lead: LeadRecord, access: AccessContext): PreRegistrationAdminLeadSummaryDTO {
  const invite = lead.preRegistrationInvites[0];
  const progress = progressOf(lead);
  const allowed = allowedFor(lead, invite, access);
  const responsible = lead.professor || lead.createdByProfessor;
  return {
    id: lead.id,
    name: lead.leadName || 'Pessoa sem nome',
    contacts: contactsOf(lead, access.canViewSensitiveContacts),
    origin: lead.leadOrigin || 'Não informada',
    status: lead.status as PreRegistrationAdminStatus,
    responsible: responsible
      ? { id: responsible.id, name: nameOf(responsible) }
      : undefined,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    lastActivityAt: latestActivityAt(lead).toISOString(),
    inviteStatus: effectiveInviteStatus(invite),
    inviteExpiresAt: iso(invite?.expiresAt),
    inviteAllowedActions: inviteCapabilities(lead, invite),
    progress,
    nextAction: nextAction(
      lead,
      invite,
      allowed,
      progress.parqRequiresProfessionalReview
    ),
    allowedActions: allowed,
  };
}

async function leadOrThrow(
  id: string,
  actor: PreRegistrationAdminActor,
  access: AccessContext
): Promise<LeadRecord> {
  const lead = await prisma.aluno.findFirst({
    where: {
      id,
      contractId: actor.contractId,
      AND: [scopedWhere(access)],
    },
    include: leadInclude,
  });
  if (!lead) {
    throw new PreRegistrationAdminError('Pré-matrícula não encontrada.', 'NOT_FOUND');
  }
  if (lead.status === ACTIVE_STATUS) {
    throw new PreRegistrationAdminError(
      'Este registro já é um aluno ativo.',
      'ACTIVE_STUDENT',
      { redirectTo: `/central-do-aluno/${lead.id}` }
    );
  }
  return lead;
}

function inviteFilterWhere(
  filter: PreRegistrationAdminInviteFilter | undefined,
  now: Date
): Prisma.AlunoWhereInput | undefined {
  if (!filter || !INVITE_FILTERS.has(filter)) return undefined;
  if (filter === 'NONE') {
    return {
      preRegistrationInvites: { none: { purpose: 'PRE_REGISTRATION' } },
    };
  }
  if (filter === 'ACTIVE') {
    return {
      preRegistrationInvites: {
        some: {
          purpose: 'PRE_REGISTRATION',
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
      },
    };
  }
  if (filter === 'EXPIRED') {
    return {
      preRegistrationInvites: {
        some: {
          purpose: 'PRE_REGISTRATION',
          OR: [
            { status: 'EXPIRED' },
            { status: 'ACTIVE', expiresAt: { lte: now } },
          ],
        },
      },
    };
  }
  return {
    preRegistrationInvites: {
      some: { purpose: 'PRE_REGISTRATION', status: filter },
    },
  };
}

function parqReviewWhere(required: boolean | undefined): Prisma.AlunoWhereInput | undefined {
  if (required === undefined) return undefined;
  const positive: Prisma.AlunoWhereInput = {
    parqSubmissions: {
      some: {
        OR: [
          { positiveItems: { not: Prisma.JsonNull } },
          { followUps: { some: { status: 'active' } } },
        ],
      },
    },
  };
  return required ? positive : { NOT: positive };
}

function activityWhere(range: DateRange | undefined): Prisma.AlunoWhereInput | undefined {
  if (!range) return undefined;
  return {
    OR: [
      { updatedAt: range },
      { onboarding: { is: { lastSavedAt: range } } },
      { lifecycleEvents: { some: { createdAt: range } } },
      {
        preRegistrationInvites: {
          some: {
            purpose: 'PRE_REGISTRATION',
            OR: [{ createdAt: range }, { lastAccessAt: range }],
          },
        },
      },
      { parqSubmissions: { some: { submittedAt: range } } },
    ],
  };
}

function orderByFor(
  sort: PreRegistrationAdminListQueryDTO['sort']
): Prisma.AlunoOrderByWithRelationInput[] {
  if (sort === 'createdAt:asc') return [{ createdAt: 'asc' }];
  if (sort === 'createdAt:desc') return [{ createdAt: 'desc' }];
  if (sort === 'name:asc') return [{ leadName: 'asc' }];
  if (sort === 'lastActivityAt:asc') {
    return [{ onboarding: { lastSavedAt: 'asc' } }, { updatedAt: 'asc' }];
  }
  return [{ onboarding: { lastSavedAt: 'desc' } }, { updatedAt: 'desc' }];
}

export const preRegistrationAdminService = {
  async list(
    actor: PreRegistrationAdminActor,
    query: PreRegistrationAdminListQueryDTO
  ): Promise<PreRegistrationAdminListResultDTO> {
    const access = await accessFor(actor);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || 20)
    );
    const search = clean(query.search);
    const created = dateRange(query.createdFrom, query.createdTo);
    const activity = dateRange(query.activityFrom, query.activityTo);
    const statuses = query.statuses?.filter((status) => ADMIN_STATUSES.has(status));
    const now = new Date();
    const conditions: Prisma.AlunoWhereInput[] = [scopedWhere(access)];

    if (search) {
      conditions.push({
        OR: [
          { leadName: { contains: search, mode: 'insensitive' } },
          { leadEmail: { contains: search, mode: 'insensitive' } },
          {
            leadPhoneNormalized: {
              contains: normalizeStudentPhone(search) || search,
            },
          },
          {
            leadCpfNormalized: {
              contains: normalizeStudentCpf(search) || search,
            },
          },
        ],
      });
    }
    const inviteFilter = inviteFilterWhere(query.inviteStatus, now);
    if (inviteFilter) conditions.push(inviteFilter);
    const activityFilter = activityWhere(activity);
    if (activityFilter) conditions.push(activityFilter);
    const parqFilter = parqReviewWhere(query.parqRequiresProfessionalReview);
    if (parqFilter) conditions.push(parqFilter);

    const statusFilter: Prisma.AlunoWhereInput['status'] =
      query.pendingReview === true
        ? 'PRE_REGISTRATION_COMPLETED'
        : query.pendingReview === false
          ? { notIn: ['PRE_REGISTRATION_COMPLETED', ACTIVE_STATUS] }
          : statuses?.length
            ? { in: statuses }
            : { not: ACTIVE_STATUS };

    const where: Prisma.AlunoWhereInput = {
      contractId: actor.contractId,
      status: statusFilter,
      ...(query.origin ? { leadOrigin: query.origin } : {}),
      ...(query.responsibleProfessorId
        ? { professorId: query.responsibleProfessorId }
        : {}),
      ...(created ? { createdAt: created } : {}),
      AND: conditions,
    };

    const [items, total, origins, professors] = await Promise.all([
      prisma.aluno.findMany({
        where,
        include: leadInclude,
        orderBy: orderByFor(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.aluno.count({ where }),
      prisma.aluno.findMany({
        where: {
          contractId: actor.contractId,
          status: { not: ACTIVE_STATUS },
          leadOrigin: { not: null },
          AND: [scopedWhere(access)],
        },
        select: { leadOrigin: true },
        distinct: ['leadOrigin'],
      }),
      prisma.professor.findMany({
        where: {
          id: { in: access.visibleProfessorIds },
          contractId: actor.contractId,
        },
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      items: items.map((item) => summaryOf(item, access)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filterOptions: {
        origins: origins
          .map((item) => item.leadOrigin)
          .filter((value): value is string => Boolean(value))
          .sort(),
        responsibleProfessors: professors.map((item) => ({
          id: item.id,
          name: item.user.profile?.name || item.user.email,
        })),
      },
    };
  },

  async checkDuplicates(
    actor: PreRegistrationAdminActor,
    input: Pick<CreatePreRegistrationLeadDTO, 'phone' | 'email' | 'cpf'>,
    excludeAlunoId?: string
  ): Promise<PreRegistrationDuplicateCheckResultDTO> {
    const access = await accessFor(actor);
    const phone = normalizeStudentPhone(input.phone);
    const email = normalizeStudentEmail(input.email);
    const cpf = normalizeStudentCpf(input.cpf);
    if (!phone && !email && !cpf) {
      return { candidates: [], hasBlockingCpfConflict: false };
    }

    const rows = await prisma.aluno.findMany({
      where: {
        contractId: actor.contractId,
        ...(excludeAlunoId ? { id: { not: excludeAlunoId } } : {}),
        OR: [
          ...(cpf ? [{ leadCpfNormalized: cpf }] : []),
          ...(email ? [{ leadEmailNormalized: email }] : []),
          ...(phone ? [{ leadPhoneNormalized: phone }] : []),
        ],
      },
      select: {
        id: true,
        leadName: true,
        leadCpfNormalized: true,
        leadEmailNormalized: true,
        leadPhoneNormalized: true,
        status: true,
        createdAt: true,
        professorId: true,
        createdByProfessorId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const candidates = rows.map((row) => {
      const accessible = isVisibleRow(row, access);
      return {
        ...(accessible ? { alunoId: row.id, status: row.status } : {}),
        name: accessible ? row.leadName || 'Pessoa sem nome' : 'Cadastro existente no contrato',
        matchingFields: [
          ...(cpf && row.leadCpfNormalized === cpf ? (['cpf'] as const) : []),
          ...(email && row.leadEmailNormalized === email ? (['email'] as const) : []),
          ...(phone && row.leadPhoneNormalized === phone ? (['phone'] as const) : []),
        ],
        ...(accessible ? { createdAt: row.createdAt.toISOString() } : {}),
        accessible,
      };
    });

    return {
      candidates,
      hasBlockingCpfConflict: candidates.some((item) =>
        item.matchingFields.includes('cpf')
      ),
    };
  },

  async create(actor: PreRegistrationAdminActor, input: CreatePreRegistrationLeadDTO) {
    const access = await accessFor(actor);
    const duplicates = await this.checkDuplicates(actor, input);
    if (duplicates.hasBlockingCpfConflict) {
      throw new PreRegistrationAdminError(
        'Já existe uma pessoa com este CPF no contrato.',
        'IDENTIFIER_CONFLICT',
        duplicates
      );
    }
    if (duplicates.candidates.length && !input.confirmPossibleDuplicate) {
      throw new PreRegistrationAdminError(
        'Encontramos cadastros semelhantes. Revise antes de continuar.',
        'POSSIBLE_DUPLICATE',
        duplicates
      );
    }

    const responsibleProfessorId = input.responsibleProfessorId || actor.professorId;
    if (!access.visibleProfessorIds.includes(responsibleProfessorId)) {
      throw new PreRegistrationAdminError('Responsável fora do seu escopo.', 'FORBIDDEN');
    }

    const lead = await createStudentLead({
      contractId: actor.contractId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      origin: input.origin,
      createdByProfessorId: actor.professorId,
    });
    await prisma.aluno.update({
      where: { id: lead.id },
      data: { professorId: responsibleProfessorId },
    });
    const identity = await loadStudentIdentity(lead.id, actor.contractId);
    await upsertStudentIdentity(
      lead.id,
      actor.contractId,
      identityPatch(identity as unknown as Record<string, unknown>, input),
      {
        actor: { userId: actor.userId, professorId: actor.professorId },
        sourceType: 'professional',
        sourceReference: 'pre_registration_admin_create',
      }
    );
    return this.getDetail(actor, lead.id);
  },

  async getDetail(
    actor: PreRegistrationAdminActor,
    id: string
  ): Promise<PreRegistrationAdminLeadDetailDTO> {
    const access = await accessFor(actor);
    await leadOrThrow(id, actor, access);
    const [invite, inviteHistory, lifecycleEvents] = await Promise.all([
      preRegistrationInviteAdminService.getSummary(id, actor.contractId, actor),
      preRegistrationInviteAdminService.getHistory(id, actor.contractId, actor),
      prisma.studentLifecycleEvent.findMany({
        where: { alunoId: id, contractId: actor.contractId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    const refreshed = await leadOrThrow(id, actor, access);
    const summary = summaryOf(refreshed, access);
    const history = [
      ...lifecycleEvents.map((event) => ({
        id: event.id,
        type: 'LIFECYCLE' as const,
        eventType: event.eventType,
        title:
          ({
            LEAD_CREATED: 'Lead criado',
            IDENTIFIER_NORMALIZED_CHANGED: 'Dados administrativos atualizados',
            STATUS_CHANGED: 'Etapa atualizada',
            ACCOUNT_LINKED: 'Conta vinculada',
            ACCOUNT_UNLINKED: 'Conta desvinculada',
            PRE_REGISTRATION_COMPLETED: 'Pré-cadastro concluído',
            PRIVACY_CONSENT_RECORDED: 'Consentimento registrado',
            ADMIN_REVIEWED: 'Revisão administrativa concluída',
            DISCARDED: 'Lead descartado',
            REOPENED: 'Lead reaberto',
            CONVERTED_TO_ACTIVE_STUDENT: 'Convertido em aluno ativo',
          } as Record<string, string>)[event.eventType] || event.eventType,
        createdAt: event.createdAt.toISOString(),
      })),
      ...inviteHistory.map((item) => ({
        id: item.id,
        type: 'INVITE' as const,
        eventType: item.status,
        title: `Convite ${item.status.toLowerCase()}`,
        description: item.revocationReason,
        createdAt: item.createdAt,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const pendencies = summary.progress.missingRequiredFields.map((field) => ({
      code: field,
      label:
        ({
          name: 'Nome completo',
          birthDate: 'Data de nascimento',
          phone: 'Telefone',
          privacyNoticeVersion: 'Versão do aviso de privacidade',
          privacyAcceptedAt: 'Aceite de privacidade',
        } as Record<string, string>)[field] || field,
      blocking: true,
    }));
    if (summary.progress.parqRequiresProfessionalReview) {
      pendencies.push({
        code: 'parq_professional_review',
        label: 'Análise profissional do PAR-Q',
        blocking: false,
      });
    }

    return {
      ...summary,
      commercial: access.canViewSensitiveContacts
        ? readCommercial(refreshed.studentProfile?.identificationData)
        : {},
      lifecycleProgress: {
        alunoId: refreshed.id,
        status: refreshed.status,
        formVersion: refreshed.onboarding?.formVersion || undefined,
        privacyNoticeVersion: refreshed.onboarding?.privacyNoticeVersion || undefined,
        privacyAcceptedAt: iso(refreshed.onboarding?.privacyAcceptedAt),
        startedAt: iso(refreshed.onboarding?.startedAt),
        lastSavedAt: iso(refreshed.onboarding?.lastSavedAt),
        completedAt: iso(refreshed.onboarding?.completedAt),
        healthModuleStatus: summary.progress.healthModuleStatus,
        parqModuleStatus: summary.progress.parqModuleStatus,
        missingRequiredFields: summary.progress.missingRequiredFields,
      },
      invite: invite || undefined,
      pendencies,
      history,
    };
  },

  async updateCommercial(
    actor: PreRegistrationAdminActor,
    id: string,
    input: UpdatePreRegistrationLeadCommercialDTO
  ) {
    const access = await accessFor(actor);
    if (!access.permissions.canEditCommercialData) {
      throw new PreRegistrationAdminError(
        'Sem permissão para editar dados comerciais.',
        'FORBIDDEN'
      );
    }
    const lead = await leadOrThrow(id, actor, access);
    if (
      input.responsibleProfessorId &&
      !access.visibleProfessorIds.includes(input.responsibleProfessorId)
    ) {
      throw new PreRegistrationAdminError('Responsável fora do seu escopo.', 'FORBIDDEN');
    }
    if (access.scope !== 'contract' && input.responsibleProfessorId === null) {
      throw new PreRegistrationAdminError(
        'Não é possível remover o responsável dentro deste escopo.',
        'FORBIDDEN'
      );
    }

    const duplicates = await this.checkDuplicates(actor, input, id);
    if (duplicates.hasBlockingCpfConflict) {
      throw new PreRegistrationAdminError(
        'Já existe uma pessoa com este CPF no contrato.',
        'IDENTIFIER_CONFLICT',
        duplicates
      );
    }
    const identity = await loadStudentIdentity(id, actor.contractId);
    await prisma.$transaction(async (tx) => {
      await tx.aluno.update({
        where: { id },
        data: {
          ...(input.origin !== undefined
            ? { leadOrigin: clean(input.origin) || lead.leadOrigin }
            : {}),
          ...(input.responsibleProfessorId !== undefined
            ? { professorId: input.responsibleProfessorId }
            : {}),
        },
      });
      await upsertStudentIdentity(
        id,
        actor.contractId,
        identityPatch(identity as unknown as Record<string, unknown>, input),
        {
          client: tx,
          actor: { userId: actor.userId, professorId: actor.professorId },
          sourceType: 'professional',
          sourceReference: 'pre_registration_admin_update',
        }
      );
      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: id,
          contractId: actor.contractId,
          eventType: 'IDENTIFIER_NORMALIZED_CHANGED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: {
            kind: 'ADMINISTRATIVE_DATA_UPDATED',
            fields: Object.keys(input),
          },
        },
      });
    });
    return this.getDetail(actor, id);
  },

  async discard(actor: PreRegistrationAdminActor, id: string, reason: string) {
    const access = await accessFor(actor);
    if (!access.permissions.canDiscard) {
      throw new PreRegistrationAdminError(
        'Sem permissão para descartar este lead.',
        'FORBIDDEN'
      );
    }
    const lead = await leadOrThrow(id, actor, access);
    const activeInvite = lead.preRegistrationInvites.find(
      (item) => effectiveInviteStatus(item) === 'ACTIVE'
    );
    if (activeInvite) {
      await preRegistrationInviteAdminService.revokeInvite(
        id,
        actor.contractId,
        { inviteId: activeInvite.id, reason: `Lead descartado: ${reason}` },
        actor
      );
    }
    await discardStudentLead(id, actor.contractId, reason, actor.professorId);
    return this.getDetail(actor, id);
  },

  async reopen(actor: PreRegistrationAdminActor, id: string, reason: string) {
    const access = await accessFor(actor);
    if (!access.permissions.canReopen) {
      throw new PreRegistrationAdminError(
        'Sem permissão para reabrir este lead.',
        'FORBIDDEN'
      );
    }
    await leadOrThrow(id, actor, access);
    await reopenDiscardedStudentLead(id, actor.contractId, reason, actor.professorId);
    return this.getDetail(actor, id);
  },

  async review(
    actor: PreRegistrationAdminActor,
    id: string,
    input: { reviewReference: string; deduplicationReference: string }
  ) {
    const access = await accessFor(actor);
    if (!access.permissions.canReview) {
      throw new PreRegistrationAdminError(
        'Sem permissão para revisar esta pré-matrícula.',
        'FORBIDDEN'
      );
    }
    await leadOrThrow(id, actor, access);
    await markStudentReadyForEnrollment(id, actor.contractId, {
      ...input,
      actor: { userId: actor.userId, professorId: actor.professorId },
    });
    return this.getDetail(actor, id);
  },
};
