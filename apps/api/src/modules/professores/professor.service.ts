import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { AccessDataScope } from '@corrida/types';
import { bankService } from '../banks/bank.service.js';
import { getCollaboratorFunctionForContract } from '../collaborator-functions/index.js';
import { buildProfessorDataScopeWhere } from '../access-control/index.js';

const prisma = new PrismaClient();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim();
}

function normalizePhone(phone?: string | null) {
  if (typeof phone !== 'string') {
    return undefined;
  }

  const normalizedPhone = phone.trim();
  return normalizedPhone.length > 0 ? normalizedPhone : undefined;
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeCpf(cpf?: string | null) {
  if (typeof cpf !== 'string') {
    return undefined;
  }

  const digits = cpf.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

function normalizeZipCode(zipCode?: string | null) {
  if (typeof zipCode !== 'string') {
    return undefined;
  }

  const digits = zipCode.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

function normalizeCompanyDocument(companyDocument?: string | null) {
  if (typeof companyDocument !== 'string') {
    return undefined;
  }

  const digits = companyDocument.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

function normalizeInstagramHandle(instagramHandle?: string | null) {
  const normalizedValue = normalizeOptionalText(instagramHandle);
  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue.replace(/^@+/, '');
}

interface HourlyRatesInput {
  personal?: number | null;
  consulting?: number | null;
  evaluation?: number | null;
}

function normalizeOperationalRoleIds(roleIds?: string[] | null) {
  if (!Array.isArray(roleIds)) {
    return [];
  }

  return Array.from(
    new Set(
      roleIds
        .map((roleId) => (typeof roleId === 'string' ? roleId.trim() : ''))
        .filter((roleId) => roleId.length > 0)
    )
  );
}

function normalizeHourlyRateValue(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return null;
  }

  return Number(value.toFixed(2));
}

function normalizeHourlyRates(hourlyRates?: HourlyRatesInput | null): Prisma.JsonObject | null {
  if (!hourlyRates) {
    return null;
  }

  const normalized = {
    personal: normalizeHourlyRateValue(hourlyRates.personal),
    consulting: normalizeHourlyRateValue(hourlyRates.consulting),
    evaluation: normalizeHourlyRateValue(hourlyRates.evaluation),
  } satisfies Prisma.JsonObject;

  const hasValue = Object.values(normalized).some((value) => typeof value === 'number');

  return hasValue ? normalized : null;
}

export interface CreateProfessorDTO {
  contractId: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  birthDate?: Date;
  cpf?: string;
  rg?: string;
  maritalStatus?: 'single' | 'married' | 'stable_union' | 'divorced' | 'separated' | 'widowed' | 'other';
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
  admissionDate?: Date;
  dismissalDate?: Date;
  currentStatus?: string;
  operationalRoleIds?: string[];
  hourlyRates?: HourlyRatesInput;
  hasSignedContract?: boolean;
  signedContractDocumentUrl?: string;
  collaboratorFunctionId: string;
  responsibleManagerId?: string;
  actorProfessorId?: string;
  dataScope?: AccessDataScope;
}

export interface UpdateProfessorDTO {
  name?: string;
  email?: string;
  password?: string;
  phone?: string | null;
  birthDate?: Date | null;
  cpf?: string | null;
  rg?: string | null;
  maritalStatus?: 'single' | 'married' | 'stable_union' | 'divorced' | 'separated' | 'widowed' | 'other' | null;
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
  admissionDate?: Date | null;
  dismissalDate?: Date | null;
  currentStatus?: string | null;
  operationalRoleIds?: string[];
  hourlyRates?: HourlyRatesInput;
  hasSignedContract?: boolean;
  signedContractDocumentUrl?: string | null;
  collaboratorFunctionId?: string;
  responsibleManagerId?: string;
  actorProfessorId?: string;
  dataScope?: AccessDataScope;
}

const PROFESSOR_SCOPE_DENIED_MESSAGE = 'Você não tem permissão para acessar este colaborador.';

function forbidden(message = PROFESSOR_SCOPE_DENIED_MESSAGE) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 403;
  return error;
}

function assertContractScope(scope?: AccessDataScope) {
  if (scope !== 'contract') {
    throw forbidden('Você não tem permissão para executar esta ação administrativa.');
  }
}

const selfServiceAllowedFields = new Set<keyof UpdateProfessorDTO>([
  'name',
  'email',
  'password',
  'phone',
  'birthDate',
  'cpf',
  'rg',
  'maritalStatus',
  'addressStreet',
  'addressNumber',
  'addressNeighborhood',
  'addressCity',
  'addressState',
  'addressComplement',
  'addressZipCode',
  'instagramHandle',
  'cref',
  'professionalSummary',
  'lattesUrl',
  'companyDocument',
  'bankCode',
  'bankName',
  'bankBranch',
  'bankAccount',
  'pixKey',
  'avatar',
  'actorProfessorId',
  'dataScope',
]);

function assertSelfServicePayload(data: UpdateProfessorDTO) {
  const blockedField = Object.keys(data).find(
    (field) => !selfServiceAllowedFields.has(field as keyof UpdateProfessorDTO)
  );

  if (blockedField) {
    throw forbidden('Seu perfil não permite alterar campos administrativos deste colaborador.');
  }
}

async function assertProfessorWithinScope(
  contractId: string,
  targetProfessorId: string,
  actorProfessorId: string | undefined,
  scope: AccessDataScope
) {
  const target = await prisma.professor.findFirst({
    where: {
      AND: [
        { id: targetProfessorId },
        buildProfessorDataScopeWhere(contractId, actorProfessorId, scope),
      ],
    },
    select: { id: true },
  });

  if (!target) {
    throw forbidden();
  }
}

function canLeadCollaborators(professor: {
  role: 'master' | 'professor';
  collaboratorFunction: { code: string };
}) {
  return professor.role === 'master' || professor.collaboratorFunction.code === 'manager';
}

function requiresResponsibleManager(collaboratorFunctionCode: string) {
  return collaboratorFunctionCode !== 'manager';
}

async function getResponsibleManagerForContract(
  contractId: string,
  responsibleManagerId: string
) {
  const responsibleManager = await prisma.professor.findFirst({
    where: {
      id: responsibleManagerId,
      contractId,
      user: {
        isActive: true,
      },
    },
    include: {
      user: {
        include: {
          profile: true,
        },
      },
      collaboratorFunction: true,
    },
  });

  if (!responsibleManager) {
    throw new Error('Gestor responsável não encontrado');
  }

  if (!canLeadCollaborators(responsibleManager)) {
    throw new Error('O colaborador selecionado não pode ser definido como gestor responsável');
  }

  return responsibleManager;
}

async function countManagedCollaborators(responsibleManagerId: string, excludeProfessorId?: string) {
  return prisma.professor.count({
    where: {
      responsibleManagerId,
      ...(excludeProfessorId ? { id: { not: excludeProfessorId } } : {}),
    },
  });
}

async function ensureCpfAvailable(cpf: string, currentUserId?: string) {
  const existingProfile = await prisma.profile.findUnique({
    where: { cpf },
    select: { userId: true },
  });

  if (existingProfile && existingProfile.userId !== currentUserId) {
    throw new Error('CPF já está registrado');
  }
}

async function ensureOperationalRolesAvailable(contractId: string, operationalRoleIds: string[]) {
  if (operationalRoleIds.length === 0) {
    return [];
  }

  const availableRoles = await prisma.collaboratorFunctionOption.findMany({
    where: {
      contractId,
      id: {
        in: operationalRoleIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (availableRoles.length !== operationalRoleIds.length) {
    throw new Error('Um ou mais cargos operacionais são inválidos para este contrato');
  }

  return availableRoles.map((role) => role.id);
}

function hasAnyLegalFinancialValue(data: {
  companyDocument?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccount?: string | null;
  pixKey?: string | null;
}) {
  return [data.companyDocument, data.bankCode, data.bankName, data.bankBranch, data.bankAccount, data.pixKey].some(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
}

const profileAuditInclude = Prisma.validator<Prisma.ProfileInclude>()({
  legalFinancialProvidedByProfessor: {
    include: {
      user: {
        include: {
          profile: true,
        },
      },
    },
  },
  legalFinancialValidatedByProfessor: {
    include: {
      user: {
        include: {
          profile: true,
        },
      },
    },
  },
});

const professorProfileInclude = Prisma.validator<Prisma.ProfessorInclude>()({
  user: {
    include: {
      profile: {
        include: profileAuditInclude,
      },
    },
  },
  collaboratorFunction: true,
  responsibleManager: {
    include: {
      user: {
        include: {
          profile: true,
        },
      },
      collaboratorFunction: true,
    },
  },
  contract: true,
});

export const professorService = {
  /**
   * Criar professor vinculado ao contrato (somente academia)
   */
  async create(data: CreateProfessorDTO) {
    assertContractScope(data.dataScope);

    const normalizedEmail = normalizeEmail(data.email);
    const normalizedName = normalizeName(data.name);
    const normalizedPhone = normalizePhone(data.phone);
    const normalizedCpf = normalizeCpf(data.cpf);
    const normalizedRg = normalizeOptionalText(data.rg);
    const normalizedAddressStreet = normalizeOptionalText(data.addressStreet);
    const normalizedAddressNumber = normalizeOptionalText(data.addressNumber);
    const normalizedAddressNeighborhood = normalizeOptionalText(data.addressNeighborhood);
    const normalizedAddressCity = normalizeOptionalText(data.addressCity);
    const normalizedAddressState = normalizeOptionalText(data.addressState);
    const normalizedAddressComplement = normalizeOptionalText(data.addressComplement);
    const normalizedAddressZipCode = normalizeZipCode(data.addressZipCode);
    const normalizedInstagramHandle = normalizeInstagramHandle(data.instagramHandle);
    const normalizedCref = normalizeOptionalText(data.cref);
    const normalizedProfessionalSummary = normalizeOptionalText(data.professionalSummary);
    const normalizedLattesUrl = normalizeOptionalText(data.lattesUrl);
    const normalizedCompanyDocument = normalizeCompanyDocument(data.companyDocument);
    const normalizedBankCode = normalizeOptionalText(data.bankCode);
    const bank = await bankService.findByCode(normalizedBankCode);
    const normalizedBankName = bank?.description ?? normalizeOptionalText(data.bankName);
    const normalizedBankBranch = normalizeOptionalText(data.bankBranch);
    const normalizedBankAccount = normalizeOptionalText(data.bankAccount);
    const normalizedPixKey = normalizeOptionalText(data.pixKey);
    const normalizedAvatar = normalizeOptionalText(data.avatar);
    const normalizedCurrentStatus = normalizeOptionalText(data.currentStatus);
    const normalizedSignedContractDocumentUrl = normalizeOptionalText(data.signedContractDocumentUrl);
    const normalizedHourlyRates = normalizeHourlyRates(data.hourlyRates);
    const legalFinancialFilled =
      !!data.actorProfessorId &&
      hasAnyLegalFinancialValue({
        companyDocument: normalizedCompanyDocument,
        bankCode: normalizedBankCode,
        bankName: normalizedBankName,
        bankBranch: normalizedBankBranch,
        bankAccount: normalizedBankAccount,
        pixKey: normalizedPixKey,
      });

    const contract = await prisma.companyContract.findUnique({
      where: { id: data.contractId },
    });

    if (!contract) {
      throw new Error('Contrato não encontrado');
    }

    if (contract.type !== 'academy') {
      throw new Error('Contrato personal não permite cadastrar professores');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new Error('E-mail já está registrado');
    }

    if (normalizedCpf) {
      await ensureCpfAvailable(normalizedCpf);
    }

    const passwordHash = await bcryptjs.hash(data.password, 10);
    const collaboratorFunction = await getCollaboratorFunctionForContract(
      contract.id,
      data.collaboratorFunctionId
    );
    const shouldRequireResponsibleManager = requiresResponsibleManager(
      collaboratorFunction.code
    );

    let responsibleManagerId: string | undefined;

    if (!collaboratorFunction.isActive) {
      throw new Error('A função selecionada está inativa');
    }

    if (shouldRequireResponsibleManager) {
      if (!data.responsibleManagerId) {
        throw new Error('Selecione um gestor responsável para este colaborador');
      }

      const responsibleManager = await getResponsibleManagerForContract(
        contract.id,
        data.responsibleManagerId
      );

      responsibleManagerId = responsibleManager.id;
    }

    const normalizedOperationalRoleIds = normalizeOperationalRoleIds(data.operationalRoleIds);
    const operationalRoleIds = Array.from(
      new Set(
        (normalizedOperationalRoleIds.length > 0
          ? normalizedOperationalRoleIds
          : [collaboratorFunction.id]
        ).concat(collaboratorFunction.id)
      )
    );
    await ensureOperationalRolesAvailable(contract.id, operationalRoleIds);

    if (data.hasSignedContract && !normalizedSignedContractDocumentUrl) {
      throw new Error('Envie o PDF do contrato assinado');
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          type: 'professor',
          profile: {
            create: {
              name: normalizedName,
              ...(normalizedPhone ? { phone: normalizedPhone } : {}),
              ...(data.birthDate ? { birthDate: data.birthDate } : {}),
              ...(normalizedCpf ? { cpf: normalizedCpf } : {}),
              ...(normalizedRg ? { rg: normalizedRg } : {}),
              ...(data.maritalStatus ? { maritalStatus: data.maritalStatus } : {}),
              ...(normalizedAddressStreet ? { addressStreet: normalizedAddressStreet } : {}),
              ...(normalizedAddressNumber ? { addressNumber: normalizedAddressNumber } : {}),
              ...(normalizedAddressNeighborhood ? { addressNeighborhood: normalizedAddressNeighborhood } : {}),
              ...(normalizedAddressCity ? { addressCity: normalizedAddressCity } : {}),
              ...(normalizedAddressState ? { addressState: normalizedAddressState } : {}),
              ...(normalizedAddressComplement ? { addressComplement: normalizedAddressComplement } : {}),
              ...(normalizedAddressZipCode ? { addressZipCode: normalizedAddressZipCode } : {}),
              ...(normalizedInstagramHandle ? { instagramHandle: normalizedInstagramHandle } : {}),
              ...(normalizedAvatar ? { avatar: normalizedAvatar } : {}),
              ...(normalizedCref ? { cref: normalizedCref } : {}),
              ...(normalizedProfessionalSummary ? { professionalSummary: normalizedProfessionalSummary } : {}),
              ...(normalizedLattesUrl ? { lattesUrl: normalizedLattesUrl } : {}),
              ...(normalizedCompanyDocument ? { companyDocument: normalizedCompanyDocument } : {}),
              ...(normalizedBankName ? { bankName: normalizedBankName } : {}),
              ...(normalizedBankBranch ? { bankBranch: normalizedBankBranch } : {}),
              ...(normalizedBankAccount ? { bankAccount: normalizedBankAccount } : {}),
              ...(normalizedPixKey ? { pixKey: normalizedPixKey } : {}),
              ...(legalFinancialFilled
                ? {
                    legalFinancialProvidedAt: new Date(),
                    legalFinancialProvidedByProfessorId: data.actorProfessorId,
                  }
                : {}),
            },
          },
        },
        include: {
          profile: {
            include: profileAuditInclude,
          },
        },
      });

      return tx.professor.create({
        data: {
          userId: user.id,
          contractId: contract.id,
          role: 'professor',
          collaboratorFunctionId: collaboratorFunction.id,
          responsibleManagerId,
          ...(data.admissionDate ? { admissionDate: data.admissionDate } : {}),
          ...(data.dismissalDate ? { dismissalDate: data.dismissalDate } : {}),
          ...(normalizedCurrentStatus ? { currentStatus: normalizedCurrentStatus } : {}),
          operationalRoleIds,
          ...(normalizedHourlyRates ? { hourlyRates: normalizedHourlyRates } : {}),
          hasSignedContract: data.hasSignedContract ?? false,
          ...(data.hasSignedContract && normalizedSignedContractDocumentUrl
            ? { signedContractDocumentUrl: normalizedSignedContractDocumentUrl }
            : {}),
        },
        include: professorProfileInclude,
      });
    });
  },

  /**
   * Listar professores do contrato
   */
  async listByContract(
    contractId: string,
    status: 'active' | 'inactive' | 'all' = 'all'
  ) {
    const where =
      status === 'all'
        ? { contractId }
        : {
            contractId,
            user: {
              isActive: status === 'active',
            },
          };

    return prisma.professor.findMany({
      where,
      include: professorProfileInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async listByAccessScope(
    contractId: string,
    actorProfessorId: string | undefined,
    scope: AccessDataScope,
    status: 'active' | 'inactive' | 'all' = 'all'
  ) {
    const scopedWhere = buildProfessorDataScopeWhere(contractId, actorProfessorId, scope);
    const where =
      status === 'all'
        ? scopedWhere
        : {
            ...scopedWhere,
            user: {
              isActive: status === 'active',
            },
          };

    return prisma.professor.findMany({
      where,
      include: professorProfileInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  /**
   * Desativar professor
   */
  async deactivate(contractId: string, professorId: string, dataScope?: AccessDataScope) {
    assertContractScope(dataScope);

    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
    });

    if (!professor) {
      throw new Error('Professor não encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('Não é possível desativar o professor master');
    }

    const managedCollaboratorsCount = await countManagedCollaborators(professor.id);

    if (managedCollaboratorsCount > 0) {
      throw new Error('Reatribua os colaboradores vinculados antes de desativar este gestor');
    }

    return prisma.user.update({
      where: { id: professor.userId },
      data: { isActive: false },
    });
  },

  /**
   * Reativar professor
   */
  async activate(contractId: string, professorId: string, dataScope?: AccessDataScope) {
    assertContractScope(dataScope);

    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
    });

    if (!professor) {
      throw new Error('Professor não encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('Não é possível reativar o professor master por esta tela');
    }

    return prisma.user.update({
      where: { id: professor.userId },
      data: { isActive: true },
    });
  },

  /**
   * Reset rápido de senha do professor
   */
  async resetPassword(contractId: string, professorId: string, dataScope?: AccessDataScope) {
    assertContractScope(dataScope);

    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
      include: { user: true },
    });

    if (!professor?.user) {
      throw new Error('Professor não encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('Não é possível resetar a senha do professor master');
    }

    const tempPassword = `temp-${Date.now().toString().slice(-6)}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: professor.userId },
      data: { passwordHash },
    });

    return tempPassword;
  },

  /**
   * Atualizar professor do contrato
   */
  async update(contractId: string, professorId: string, data: UpdateProfessorDTO) {
    const scope = data.dataScope ?? 'contract';

    await assertProfessorWithinScope(
      contractId,
      professorId,
      data.actorProfessorId,
      scope
    );

    if (scope === 'self' || professorId === data.actorProfessorId) {
      assertSelfServicePayload(data);
    }

    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        collaboratorFunction: true,
      },
    });

    if (!professor) {
      throw new Error('Professor não encontrado');
    }

    const normalizedEmail =
      typeof data.email === 'string' && data.email.trim().length > 0
        ? normalizeEmail(data.email)
        : undefined;

    const normalizedName =
      typeof data.name === 'string' && data.name.trim().length > 0
        ? normalizeName(data.name)
        : undefined;
    const normalizedCpf = data.cpf === undefined ? undefined : normalizeCpf(data.cpf);
    const normalizedCurrentStatus =
      data.currentStatus === undefined ? undefined : normalizeOptionalText(data.currentStatus);
    const normalizedSignedContractDocumentUrl =
      data.signedContractDocumentUrl === undefined
        ? undefined
        : normalizeOptionalText(data.signedContractDocumentUrl);
    const normalizedCompanyDocument =
      data.companyDocument === undefined ? undefined : normalizeCompanyDocument(data.companyDocument);
    const normalizedBankCode = data.bankCode === undefined ? undefined : normalizeOptionalText(data.bankCode);
    const bank = normalizedBankCode ? await bankService.findByCode(normalizedBankCode) : null;

    if (normalizedEmail && normalizedEmail !== professor.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser && existingUser.id !== professor.user.id) {
        throw new Error('E-mail já está registrado');
      }
    }

    if (normalizedCpf) {
      await ensureCpfAvailable(normalizedCpf, professor.user.id);
    }

    const updateUserData: any = {};
    const updateProfileData: any = {};
    const updateProfessorData: any = {};
    let targetCollaboratorFunction = professor.collaboratorFunction;

    if (normalizedEmail) {
      updateUserData.email = normalizedEmail;
    }

    if (typeof data.password === 'string' && data.password.trim().length > 0) {
      updateUserData.passwordHash = await bcryptjs.hash(data.password, 10);
    }

    if (normalizedName) {
      updateProfileData.name = normalizedName;
    }

    if (data.phone !== undefined) {
      updateProfileData.phone = data.phone === null ? null : normalizePhone(data.phone) ?? null;
    }

    if (data.birthDate !== undefined) {
      updateProfileData.birthDate = data.birthDate;
    }

    if (data.cpf !== undefined) {
      updateProfileData.cpf = data.cpf === null ? null : normalizedCpf ?? null;
    }

    if (data.rg !== undefined) {
      updateProfileData.rg = data.rg === null ? null : normalizeOptionalText(data.rg) ?? null;
    }

    if (data.maritalStatus !== undefined) {
      updateProfileData.maritalStatus = data.maritalStatus;
    }

    if (data.addressStreet !== undefined) {
      updateProfileData.addressStreet =
        data.addressStreet === null ? null : normalizeOptionalText(data.addressStreet) ?? null;
    }

    if (data.addressNumber !== undefined) {
      updateProfileData.addressNumber =
        data.addressNumber === null ? null : normalizeOptionalText(data.addressNumber) ?? null;
    }

    if (data.addressNeighborhood !== undefined) {
      updateProfileData.addressNeighborhood =
        data.addressNeighborhood === null ? null : normalizeOptionalText(data.addressNeighborhood) ?? null;
    }

    if (data.addressCity !== undefined) {
      updateProfileData.addressCity =
        data.addressCity === null ? null : normalizeOptionalText(data.addressCity) ?? null;
    }

    if (data.addressState !== undefined) {
      updateProfileData.addressState =
        data.addressState === null ? null : normalizeOptionalText(data.addressState) ?? null;
    }

    if (data.addressComplement !== undefined) {
      updateProfileData.addressComplement =
        data.addressComplement === null ? null : normalizeOptionalText(data.addressComplement) ?? null;
    }

    if (data.addressZipCode !== undefined) {
      updateProfileData.addressZipCode =
        data.addressZipCode === null ? null : normalizeZipCode(data.addressZipCode) ?? null;
    }

    if (data.instagramHandle !== undefined) {
      updateProfileData.instagramHandle =
        data.instagramHandle === null ? null : normalizeInstagramHandle(data.instagramHandle) ?? null;
    }

    if (data.cref !== undefined) {
      updateProfileData.cref = data.cref === null ? null : normalizeOptionalText(data.cref) ?? null;
    }

    if (data.professionalSummary !== undefined) {
      updateProfileData.professionalSummary =
        data.professionalSummary === null ? null : normalizeOptionalText(data.professionalSummary) ?? null;
    }

    if (data.lattesUrl !== undefined) {
      updateProfileData.lattesUrl =
        data.lattesUrl === null ? null : normalizeOptionalText(data.lattesUrl) ?? null;
    }

    if (data.avatar !== undefined) {
      updateProfileData.avatar =
        data.avatar === null ? null : normalizeOptionalText(data.avatar) ?? null;
    }

    if (data.companyDocument !== undefined) {
      updateProfileData.companyDocument =
        data.companyDocument === null ? null : normalizedCompanyDocument ?? null;
    }

    if (data.bankCode !== undefined) {
      updateProfileData.bankCode = data.bankCode === null ? null : normalizedBankCode ?? null;
    }

    if (data.bankCode !== undefined || data.bankName !== undefined) {
      updateProfileData.bankName =
        data.bankCode === null
          ? null
          : bank?.description ?? (data.bankName === null ? null : normalizeOptionalText(data.bankName) ?? null);
    }

    if (data.bankBranch !== undefined) {
      updateProfileData.bankBranch =
        data.bankBranch === null ? null : normalizeOptionalText(data.bankBranch) ?? null;
    }

    if (data.bankAccount !== undefined) {
      updateProfileData.bankAccount =
        data.bankAccount === null ? null : normalizeOptionalText(data.bankAccount) ?? null;
    }

    if (data.pixKey !== undefined) {
      updateProfileData.pixKey = data.pixKey === null ? null : normalizeOptionalText(data.pixKey) ?? null;
    }

    const changedLegalFinancialFields = [
      'companyDocument',
      'bankCode',
      'bankName',
      'bankBranch',
      'bankAccount',
      'pixKey',
    ].some((field) => field in updateProfileData);

    if (changedLegalFinancialFields && data.actorProfessorId) {
      const nextLegalFinancialState = {
        companyDocument:
          updateProfileData.companyDocument !== undefined
            ? updateProfileData.companyDocument
            : professor.user.profile?.companyDocument ?? null,
        bankCode:
          updateProfileData.bankCode !== undefined
            ? updateProfileData.bankCode
            : professor.user.profile?.bankCode ?? null,
        bankName:
          updateProfileData.bankName !== undefined
            ? updateProfileData.bankName
            : professor.user.profile?.bankName ?? null,
        bankBranch:
          updateProfileData.bankBranch !== undefined
            ? updateProfileData.bankBranch
            : professor.user.profile?.bankBranch ?? null,
        bankAccount:
          updateProfileData.bankAccount !== undefined
            ? updateProfileData.bankAccount
            : professor.user.profile?.bankAccount ?? null,
        pixKey:
          updateProfileData.pixKey !== undefined
            ? updateProfileData.pixKey
            : professor.user.profile?.pixKey ?? null,
      };

      if (hasAnyLegalFinancialValue(nextLegalFinancialState)) {
        updateProfileData.legalFinancialProvidedAt = new Date();
        updateProfileData.legalFinancialProvidedByProfessorId = data.actorProfessorId;
      } else {
        updateProfileData.legalFinancialProvidedAt = null;
        updateProfileData.legalFinancialProvidedByProfessorId = null;
      }

      updateProfileData.legalFinancialValidatedAt = null;
      updateProfileData.legalFinancialValidatedByProfessorId = null;
    }

    if (data.collaboratorFunctionId) {
      const collaboratorFunction = await getCollaboratorFunctionForContract(
        contractId,
        data.collaboratorFunctionId
      );

      if (!collaboratorFunction.isActive && collaboratorFunction.id !== professor.collaboratorFunctionId) {
        throw new Error('A função selecionada está inativa');
      }

      updateProfessorData.collaboratorFunctionId = collaboratorFunction.id;
      targetCollaboratorFunction = collaboratorFunction;
    }

    if (data.admissionDate !== undefined) {
      updateProfessorData.admissionDate = data.admissionDate;
    }

    if (data.dismissalDate !== undefined) {
      updateProfessorData.dismissalDate = data.dismissalDate;
    }

    if (data.currentStatus !== undefined) {
      updateProfessorData.currentStatus = normalizedCurrentStatus ?? null;
    }

    if (data.hourlyRates !== undefined) {
      updateProfessorData.hourlyRates = normalizeHourlyRates(data.hourlyRates);
    }

    if (data.hasSignedContract !== undefined) {
      updateProfessorData.hasSignedContract = data.hasSignedContract;
    }

    const nextHasSignedContract = data.hasSignedContract ?? professor.hasSignedContract;
    const nextSignedContractDocumentUrl =
      data.hasSignedContract === false
        ? null
        : data.signedContractDocumentUrl === undefined
          ? professor.signedContractDocumentUrl
          : normalizedSignedContractDocumentUrl ?? null;

    if (nextHasSignedContract && !nextSignedContractDocumentUrl) {
      throw new Error('Envie o PDF do contrato assinado');
    }

    if (data.signedContractDocumentUrl !== undefined || data.hasSignedContract === false) {
      updateProfessorData.signedContractDocumentUrl = nextSignedContractDocumentUrl;
    }

    if (data.operationalRoleIds !== undefined || data.collaboratorFunctionId !== undefined) {
      const baseOperationalRoleIds =
        data.operationalRoleIds !== undefined
          ? normalizeOperationalRoleIds(data.operationalRoleIds)
          : professor.operationalRoleIds;
      const operationalRoleIds = Array.from(
        new Set(
          (baseOperationalRoleIds.length > 0
            ? baseOperationalRoleIds
            : [targetCollaboratorFunction.id]
          ).concat(targetCollaboratorFunction.id)
        )
      );

      await ensureOperationalRolesAvailable(contractId, operationalRoleIds);
      updateProfessorData.operationalRoleIds = operationalRoleIds;
    }

    const managedCollaboratorsCount = await countManagedCollaborators(professorId);

    if (
      managedCollaboratorsCount > 0 &&
      !canLeadCollaborators({
        role: professor.role,
        collaboratorFunction: targetCollaboratorFunction,
      })
    ) {
      throw new Error(
        'Reatribua os colaboradores vinculados antes de remover a função de gestor deste colaborador'
      );
    }

    if (requiresResponsibleManager(targetCollaboratorFunction.code)) {
      const desiredResponsibleManagerId =
        data.responsibleManagerId ?? professor.responsibleManagerId;

      if (!desiredResponsibleManagerId) {
        throw new Error('Selecione um gestor responsável para este colaborador');
      }

      if (desiredResponsibleManagerId === professorId) {
        throw new Error('Um colaborador não pode ser o próprio gestor responsável');
      }

      const responsibleManager = await getResponsibleManagerForContract(
        contractId,
        desiredResponsibleManagerId
      );

      updateProfessorData.responsibleManagerId = responsibleManager.id;
    } else {
      updateProfessorData.responsibleManagerId = null;
    }

    return prisma.$transaction(async (tx) => {
      if (Object.keys(updateUserData).length > 0) {
        await tx.user.update({
          where: { id: professor.userId },
          data: updateUserData,
        });
      }

      if (Object.keys(updateProfileData).length > 0) {
        await tx.profile.update({
          where: { userId: professor.userId },
          data: updateProfileData,
        });
      }

      if (Object.keys(updateProfessorData).length > 0) {
        await tx.professor.update({
          where: { id: professorId },
          data: updateProfessorData,
        });
      }

      return tx.professor.findUnique({
        where: { id: professorId },
        include: professorProfileInclude,
      });
    });
  },

  async validateLegalFinancial(
    contractId: string,
    professorId: string,
    validatorProfessorId: string,
    dataScope?: AccessDataScope
  ) {
    assertContractScope(dataScope);

    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!professor?.user?.profile) {
      throw new Error('Professor não encontrado');
    }

    if (
      !hasAnyLegalFinancialValue({
        companyDocument: professor.user.profile.companyDocument,
        bankName: professor.user.profile.bankName,
        bankBranch: professor.user.profile.bankBranch,
        bankAccount: professor.user.profile.bankAccount,
        pixKey: professor.user.profile.pixKey,
      })
    ) {
      throw new Error('Preencha os dados juridicos e financeiros antes de validar este bloco');
    }

    await prisma.profile.update({
      where: { userId: professor.userId },
      data: {
        legalFinancialValidatedAt: new Date(),
        legalFinancialValidatedByProfessorId: validatorProfessorId,
      },
    });

    return prisma.professor.findUnique({
      where: { id: professorId },
      include: professorProfileInclude,
    });
  },
};
