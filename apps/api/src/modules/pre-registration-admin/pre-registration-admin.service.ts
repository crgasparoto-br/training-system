import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AccessDataScope,
  CreatePreRegistrationLeadDTO,
  PreRegistrationAdminAllowedActionsDTO,
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationAdminLeadSummaryDTO,
  PreRegistrationAdminListQueryDTO,
  PreRegistrationAdminListResultDTO,
  PreRegistrationAdminNextActionDTO,
  PreRegistrationDuplicateCheckResultDTO,
  UpdatePreRegistrationLeadCommercialDTO,
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
const ACTIVE = 'ACTIVE_STUDENT';
const MAX_PAGE_SIZE = 100;

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
      | 'PRECONDITION_FAILED',
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
};

type CommercialMetadata = { notes?: string; unit?: string };

const clean = (value?: string | null) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const iso = (value?: Date | null) => value?.toISOString();
const nameOf = (professor: any) =>
  professor?.user?.profile?.name || professor?.user?.email || 'Responsável sem nome';

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

async function accessFor(actor: PreRegistrationAdminActor): Promise<AccessContext> {
  const professor = await prisma.professor.findFirst({
    where: { id: actor.professorId, contractId: actor.contractId },
    select: {
      id: true,
      role: true,
      collaboratorFunction: { select: { id: true, code: true } },
    },
  });
  if (!professor) throw new PreRegistrationAdminError('Responsável não encontrado.', 'NOT_FOUND');
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
  if (!scope) throw new PreRegistrationAdminError('Perfil sem escopo para pré-matrículas.', 'FORBIDDEN');
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
  return {
    scope,
    visibleProfessorIds: visible.map((item) => item.id),
    permissions: {
      canEditCommercialData: edit,
      canGenerateInvite: invite,
      canRegenerateInvite: invite,
      canRevokeInvite: revoke,
      canReview: review,
      canDiscard: discard,
      canReopen: discard,
      canConvert: convert,
      canOpenStudentCentral: true,
    },
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

function effectiveInviteStatus(invite: any) {
  return invite?.status === 'ACTIVE' && invite.expiresAt <= new Date()
    ? 'EXPIRED'
    : invite?.status;
}

function inviteCapabilities(lead: any, invite: any) {
  const status = effectiveInviteStatus(invite);
  const compatible = lead.status === 'LEAD' || lead.status === 'INVITED';
  return {
    canGenerateFirst: compatible && !invite,
    canRegenerate: compatible && status === 'ACTIVE',
    canRevoke: status === 'ACTIVE',
  };
}

function progressOf(lead: any) {
  const data = (lead.studentProfile?.identificationData || {}) as Record<string, unknown>;
  const missing = findMissingPreRegistrationFields({
    name: typeof data.name === 'string' ? data.name : lead.leadName || undefined,
    phone: typeof data.phone === 'string' ? data.phone : lead.leadPhone || undefined,
    birthDate: typeof data.birthDate === 'string' ? data.birthDate : lead.birthDate || undefined,
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
    completedFields: Math.max(0, totalFields - missing.length),
    totalFields,
    missingRequiredFields: missing,
    startedAt: iso(lead.onboarding?.startedAt),
    lastSavedAt: iso(lead.onboarding?.lastSavedAt),
    completedAt: iso(lead.onboarding?.completedAt),
  } as const;
}

function allowedFor(lead: any, invite: any, access: AccessContext) {
  const inviteActions = inviteCapabilities(lead, invite);
  return {
    canEditCommercialData: access.permissions.canEditCommercialData,
    canGenerateInvite: access.permissions.canGenerateInvite && inviteActions.canGenerateFirst,
    canRegenerateInvite: access.permissions.canRegenerateInvite && inviteActions.canRegenerate,
    canRevokeInvite: access.permissions.canRevokeInvite && inviteActions.canRevoke,
    canReview: access.permissions.canReview && lead.status === 'PRE_REGISTRATION_COMPLETED',
    canDiscard: access.permissions.canDiscard && lead.status !== 'DISCARDED',
    canReopen: access.permissions.canReopen && lead.status === 'DISCARDED',
    canConvert: access.permissions.canConvert && lead.status === 'READY_FOR_ENROLLMENT',
    canOpenStudentCentral: false,
  };
}

function nextAction(lead: any, invite: any, allowed: PreRegistrationAdminAllowedActionsDTO): PreRegistrationAdminNextActionDTO {
  if (lead.status === 'DISCARDED') return { code: 'REOPEN', label: 'Reabrir lead', description: 'Retome o atendimento preservando o histórico.', enabled: allowed.canReopen };
  if (lead.status === 'LEAD') return { code: 'CREATE_INVITE', label: 'Gerar link de pré-cadastro', description: 'Crie um link seguro para iniciar o preenchimento.', enabled: allowed.canGenerateInvite };
  if (lead.status === 'INVITED') {
    const active = effectiveInviteStatus(invite) === 'ACTIVE';
    return { code: active ? 'WAIT_FOR_ACCESS' : 'CREATE_INVITE', label: active ? 'Aguardar primeiro acesso' : 'Gerar novo link', description: active ? 'O convite está ativo e dentro do prazo.' : 'O convite anterior não está mais disponível.', enabled: active || allowed.canGenerateInvite };
  }
  if (lead.status === 'PRE_REGISTRATION_IN_PROGRESS') return { code: 'FOLLOW_UP_REGISTRATION', label: 'Acompanhar pendências', description: 'Oriente a conclusão dos campos pendentes.', enabled: true };
  if (lead.status === 'PRE_REGISTRATION_COMPLETED') return { code: 'REVIEW_REGISTRATION', label: 'Revisar pré-matrícula', description: 'Confirme os dados e a deduplicação.', enabled: allowed.canReview };
  if (lead.status === 'READY_FOR_ENROLLMENT') return { code: 'WAIT_FOR_CONVERSION', label: 'Abrir fluxo de matrícula', description: 'O cadastro está pronto para contratação e ativação.', enabled: allowed.canConvert };
  return { code: 'NONE', label: 'Nenhuma ação pendente', description: 'Não há ação administrativa disponível.', enabled: false };
}

function summaryOf(lead: any, access: AccessContext): PreRegistrationAdminLeadSummaryDTO {
  const invite = lead.preRegistrationInvites?.[0];
  const allowed = allowedFor(lead, invite, access);
  const responsible = lead.professor || lead.createdByProfessor;
  return {
    id: lead.id,
    name: lead.leadName || 'Pessoa sem nome',
    contacts: { phone: lead.leadPhone || undefined, email: lead.leadEmail || undefined, cpf: lead.leadCpf || undefined },
    origin: lead.leadOrigin || 'Não informada',
    status: lead.status,
    responsible: responsible ? { id: responsible.id, name: nameOf(responsible) } : undefined,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    lastActivityAt: (lead.onboarding?.lastSavedAt || lead.updatedAt).toISOString(),
    inviteStatus: effectiveInviteStatus(invite),
    inviteExpiresAt: iso(invite?.expiresAt),
    inviteAllowedActions: inviteCapabilities(lead, invite),
    progress: progressOf(lead),
    nextAction: nextAction(lead, invite, allowed),
    allowedActions: allowed,
  };
}

const leadInclude = {
  onboarding: true,
  studentProfile: true,
  professor: { include: { user: { include: { profile: true } } } },
  createdByProfessor: { include: { user: { include: { profile: true } } } },
  preRegistrationInvites: {
    where: { purpose: 'PRE_REGISTRATION' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
};

async function leadOrThrow(id: string, actor: PreRegistrationAdminActor, access: AccessContext) {
  const lead = await prisma.aluno.findFirst({
    where: { id, contractId: actor.contractId, status: { not: ACTIVE }, AND: [scopedWhere(access)] },
    include: leadInclude,
  });
  if (!lead) throw new PreRegistrationAdminError('Pré-matrícula não encontrada.', 'NOT_FOUND');
  return lead;
}

export const preRegistrationAdminService = {
  async list(actor: PreRegistrationAdminActor, query: PreRegistrationAdminListQueryDTO): Promise<PreRegistrationAdminListResultDTO> {
    const access = await accessFor(actor);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));
    const search = clean(query.search);
    const where: Prisma.AlunoWhereInput = {
      contractId: actor.contractId,
      status: query.statuses?.length ? { in: query.statuses } : { not: ACTIVE },
      ...(query.origin ? { leadOrigin: query.origin } : {}),
      ...(query.responsibleProfessorId ? { professorId: query.responsibleProfessorId } : {}),
      ...(query.createdFrom || query.createdTo
        ? { createdAt: { ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}), ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}) } }
        : {}),
      ...(search ? { OR: [
        { leadName: { contains: search, mode: 'insensitive' } },
        { leadEmail: { contains: search, mode: 'insensitive' } },
        { leadPhoneNormalized: { contains: normalizeStudentPhone(search) || search } },
        { leadCpfNormalized: { contains: normalizeStudentCpf(search) || search } },
      ] } : {}),
      AND: [scopedWhere(access)],
    };
    const orderBy: Prisma.AlunoOrderByWithRelationInput = query.sort === 'createdAt:asc'
      ? { createdAt: 'asc' }
      : query.sort === 'name:asc'
        ? { leadName: 'asc' }
        : { updatedAt: 'desc' };
    const [items, total, origins, professors] = await Promise.all([
      prisma.aluno.findMany({ where, include: leadInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.aluno.count({ where }),
      prisma.aluno.findMany({ where: { contractId: actor.contractId, status: { not: ACTIVE }, leadOrigin: { not: null }, AND: [scopedWhere(access)] }, select: { leadOrigin: true }, distinct: ['leadOrigin'] }),
      prisma.professor.findMany({ where: { id: { in: access.visibleProfessorIds }, contractId: actor.contractId }, include: { user: { include: { profile: true } } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      items: items.map((item) => summaryOf(item, access)),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      filterOptions: {
        origins: origins.map((item) => item.leadOrigin).filter((value): value is string => Boolean(value)).sort(),
        responsibleProfessors: professors.map((item) => ({ id: item.id, name: nameOf(item) })),
      },
    };
  },

  async checkDuplicates(actor: PreRegistrationAdminActor, input: Pick<CreatePreRegistrationLeadDTO, 'phone' | 'email' | 'cpf'>, excludeAlunoId?: string): Promise<PreRegistrationDuplicateCheckResultDTO> {
    const access = await accessFor(actor);
    const phone = normalizeStudentPhone(input.phone);
    const email = normalizeStudentEmail(input.email);
    const cpf = normalizeStudentCpf(input.cpf);
    if (!phone && !email && !cpf) return { candidates: [], hasBlockingCpfConflict: false };
    const rows = await prisma.aluno.findMany({
      where: {
        contractId: actor.contractId,
        ...(excludeAlunoId ? { id: { not: excludeAlunoId } } : {}),
        AND: [scopedWhere(access), { OR: [
          ...(cpf ? [{ leadCpfNormalized: cpf }] : []),
          ...(email ? [{ leadEmailNormalized: email }] : []),
          ...(phone ? [{ leadPhoneNormalized: phone }] : []),
        ] }],
      },
      select: { id: true, leadName: true, leadCpfNormalized: true, leadEmailNormalized: true, leadPhoneNormalized: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const candidates = rows.map((row) => ({
      alunoId: row.id,
      name: row.leadName || 'Pessoa sem nome',
      status: row.status,
      matchingFields: [
        ...(cpf && row.leadCpfNormalized === cpf ? (['cpf'] as const) : []),
        ...(email && row.leadEmailNormalized === email ? (['email'] as const) : []),
        ...(phone && row.leadPhoneNormalized === phone ? (['phone'] as const) : []),
      ],
      createdAt: row.createdAt.toISOString(),
    }));
    return { candidates, hasBlockingCpfConflict: candidates.some((item) => item.matchingFields.includes('cpf')) };
  },

  async create(actor: PreRegistrationAdminActor, input: CreatePreRegistrationLeadDTO & { confirmPossibleDuplicate?: boolean }) {
    const access = await accessFor(actor);
    const duplicates = await this.checkDuplicates(actor, input);
    if (duplicates.hasBlockingCpfConflict) throw new PreRegistrationAdminError('Já existe uma pessoa com este CPF no contrato.', 'IDENTIFIER_CONFLICT', duplicates);
    if (duplicates.candidates.length && !input.confirmPossibleDuplicate) throw new PreRegistrationAdminError('Encontramos cadastros semelhantes. Revise antes de continuar.', 'POSSIBLE_DUPLICATE', duplicates);
    const responsibleProfessorId = input.responsibleProfessorId || actor.professorId;
    if (!access.visibleProfessorIds.includes(responsibleProfessorId)) throw new PreRegistrationAdminError('Responsável fora do seu escopo.', 'FORBIDDEN');
    const lead = await createStudentLead({ contractId: actor.contractId, name: input.name, phone: input.phone, email: input.email, origin: input.origin, createdByProfessorId: actor.professorId });
    await prisma.aluno.update({ where: { id: lead.id }, data: { professorId: responsibleProfessorId } });
    const identity = await loadStudentIdentity(lead.id, actor.contractId);
    await upsertStudentIdentity(lead.id, actor.contractId, identityPatch(identity as unknown as Record<string, unknown>, input), { actor: { userId: actor.userId, professorId: actor.professorId }, sourceType: 'professional', sourceReference: 'pre_registration_admin_create' });
    return this.getDetail(actor, lead.id);
  },

  async getDetail(actor: PreRegistrationAdminActor, id: string): Promise<PreRegistrationAdminLeadDetailDTO> {
    const access = await accessFor(actor);
    await leadOrThrow(id, actor, access);
    const [invite, inviteHistory, lifecycleEvents] = await Promise.all([
      preRegistrationInviteAdminService.getSummary(id, actor.contractId, actor),
      preRegistrationInviteAdminService.getHistory(id, actor.contractId, actor),
      prisma.studentLifecycleEvent.findMany({ where: { alunoId: id, contractId: actor.contractId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const refreshed = await leadOrThrow(id, actor, access);
    const summary = summaryOf(refreshed, access);
    const history = [
      ...lifecycleEvents.map((event) => ({ id: event.id, type: 'LIFECYCLE' as const, eventType: event.eventType, title: ({ LEAD_CREATED: 'Lead criado', IDENTIFIER_NORMALIZED_CHANGED: 'Dados administrativos atualizados', STATUS_CHANGED: 'Etapa atualizada', ACCOUNT_LINKED: 'Conta vinculada', ACCOUNT_UNLINKED: 'Conta desvinculada', PRE_REGISTRATION_COMPLETED: 'Pré-cadastro concluído', PRIVACY_CONSENT_RECORDED: 'Consentimento registrado', ADMIN_REVIEWED: 'Revisão administrativa concluída', DISCARDED: 'Lead descartado', REOPENED: 'Lead reaberto', CONVERTED_TO_ACTIVE_STUDENT: 'Convertido em aluno ativo' } as Record<string, string>)[event.eventType] || event.eventType, createdAt: event.createdAt.toISOString() })),
      ...inviteHistory.map((item) => ({ id: item.id, type: 'INVITE' as const, eventType: item.status, title: `Convite ${item.status.toLowerCase()}`, description: item.revocationReason, createdAt: item.createdAt })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pendencies = summary.progress.missingRequiredFields.map((field) => ({ code: field, label: ({ name: 'Nome completo', birthDate: 'Data de nascimento', phone: 'Telefone', privacyNoticeVersion: 'Versão do aviso de privacidade', privacyAcceptedAt: 'Aceite de privacidade' } as Record<string, string>)[field] || field, blocking: true }));
    return {
      ...summary,
      commercial: readCommercial(refreshed.studentProfile?.identificationData),
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

  async updateCommercial(actor: PreRegistrationAdminActor, id: string, input: UpdatePreRegistrationLeadCommercialDTO) {
    const access = await accessFor(actor);
    if (!access.permissions.canEditCommercialData) throw new PreRegistrationAdminError('Sem permissão para editar dados comerciais.', 'FORBIDDEN');
    const lead = await leadOrThrow(id, actor, access);
    if (input.responsibleProfessorId && !access.visibleProfessorIds.includes(input.responsibleProfessorId)) throw new PreRegistrationAdminError('Responsável fora do seu escopo.', 'FORBIDDEN');
    const duplicates = await this.checkDuplicates(actor, input, id);
    if (duplicates.hasBlockingCpfConflict) throw new PreRegistrationAdminError('Já existe uma pessoa com este CPF no contrato.', 'IDENTIFIER_CONFLICT', duplicates);
    const identity = await loadStudentIdentity(id, actor.contractId);
    await prisma.$transaction(async (tx) => {
      await tx.aluno.update({ where: { id }, data: {
        ...(input.origin !== undefined ? { leadOrigin: clean(input.origin) || lead.leadOrigin } : {}),
        ...(input.responsibleProfessorId !== undefined ? { professorId: input.responsibleProfessorId } : {}),
      } });
      await upsertStudentIdentity(id, actor.contractId, identityPatch(identity as unknown as Record<string, unknown>, input), { client: tx, actor: { userId: actor.userId, professorId: actor.professorId }, sourceType: 'professional', sourceReference: 'pre_registration_admin_update' });
      await tx.studentLifecycleEvent.create({ data: { alunoId: id, contractId: actor.contractId, eventType: 'IDENTIFIER_NORMALIZED_CHANGED', actorUserId: actor.userId, actorProfessorId: actor.professorId, metadata: { kind: 'ADMINISTRATIVE_DATA_UPDATED', fields: Object.keys(input) } } });
    });
    return this.getDetail(actor, id);
  },

  async discard(actor: PreRegistrationAdminActor, id: string, reason: string) {
    const access = await accessFor(actor);
    if (!access.permissions.canDiscard) throw new PreRegistrationAdminError('Sem permissão para descartar este lead.', 'FORBIDDEN');
    const lead = await leadOrThrow(id, actor, access);
    const activeInvite = lead.preRegistrationInvites?.find((item: any) => effectiveInviteStatus(item) === 'ACTIVE');
    if (activeInvite) await preRegistrationInviteAdminService.revokeInvite(id, actor.contractId, { inviteId: activeInvite.id, reason: `Lead descartado: ${reason}` }, actor);
    await discardStudentLead(id, actor.contractId, reason, actor.professorId);
    return this.getDetail(actor, id);
  },

  async reopen(actor: PreRegistrationAdminActor, id: string, reason: string) {
    const access = await accessFor(actor);
    if (!access.permissions.canReopen) throw new PreRegistrationAdminError('Sem permissão para reabrir este lead.', 'FORBIDDEN');
    await leadOrThrow(id, actor, access);
    await reopenDiscardedStudentLead(id, actor.contractId, reason, actor.professorId);
    return this.getDetail(actor, id);
  },

  async review(actor: PreRegistrationAdminActor, id: string, input: { reviewReference: string; deduplicationReference: string }) {
    const access = await accessFor(actor);
    if (!access.permissions.canReview) throw new PreRegistrationAdminError('Sem permissão para revisar esta pré-matrícula.', 'FORBIDDEN');
    await leadOrThrow(id, actor, access);
    await markStudentReadyForEnrollment(id, actor.contractId, { ...input, actor: { userId: actor.userId, professorId: actor.professorId } });
    return this.getDetail(actor, id);
  },
};
