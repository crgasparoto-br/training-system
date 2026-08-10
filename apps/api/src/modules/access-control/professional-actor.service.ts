import { Prisma, PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import {
  buildFullAccessPermissions,
  canProfessorAccessBlock,
  canProfessorAccessScreen,
  serializeAccessPermission,
  syncAccessPermissionsForFunction,
} from './access-control.service.js';

const prisma = new PrismaClient();
const INACTIVE_PROFESSOR_STATUSES = new Set([
  'inactive',
  'inativo',
  'dismissed',
  'desligado',
  'terminated',
  'encerrado',
]);

export type ProfessionalActorContext = {
  userId: string;
  contractId: string;
  contractType: string;
  collaboratorFunctionId: string;
  collaboratorFunctionCode: string;
  actorProfessorId?: string;
  role: 'master' | 'professor';
  source: 'professor' | 'direct-membership';
};

type MembershipRow = {
  userId: string;
  contractId: string;
  contractType: string;
  collaboratorFunctionId: string;
  collaboratorFunctionCode: string;
};

function professorIsActive(professor: {
  currentStatus: string | null;
  dismissalDate: Date | null;
  user: { isActive: boolean };
  collaboratorFunction: { isActive: boolean };
}) {
  const normalizedStatus = professor.currentStatus?.trim().toLowerCase() ?? 'active';
  const dismissalIsEffective = Boolean(
    professor.dismissalDate && professor.dismissalDate.getTime() <= Date.now()
  );
  return professor.user.isActive
    && professor.collaboratorFunction.isActive
    && !INACTIVE_PROFESSOR_STATUSES.has(normalizedStatus)
    && !dismissalIsEffective;
}

export async function resolveProfessionalActor(
  userId: string
): Promise<ProfessionalActorContext | null> {
  const professor = await prisma.professor.findUnique({
    where: { userId },
    include: {
      user: { select: { isActive: true, type: true } },
      collaboratorFunction: {
        select: { id: true, code: true, isActive: true },
      },
      contract: { select: { id: true, type: true } },
    },
  });

  // An existing Professor row is authoritative. An inactive row must not be
  // bypassed by a parallel direct membership.
  if (professor) {
    if (professor.user.type !== 'professor' || !professorIsActive(professor)) {
      return null;
    }
    return {
      userId,
      contractId: professor.contractId,
      contractType: professor.contract.type,
      collaboratorFunctionId: professor.collaboratorFunction.id,
      collaboratorFunctionCode: professor.collaboratorFunction.code,
      actorProfessorId: professor.id,
      role: professor.role,
      source: 'professor',
    };
  }

  const rows = await prisma.$queryRaw<MembershipRow[]>(Prisma.sql`
    SELECT
      membership."userId" AS "userId",
      membership."contractId" AS "contractId",
      contract."type"::text AS "contractType",
      membership."collaboratorFunctionId" AS "collaboratorFunctionId",
      collaborator_function."code" AS "collaboratorFunctionCode"
    FROM "ProfessionalActorMembership" membership
    JOIN "User" app_user
      ON app_user."id" = membership."userId"
    JOIN "Contract" contract
      ON contract."id" = membership."contractId"
    JOIN "CollaboratorFunctionOption" collaborator_function
      ON collaborator_function."id" = membership."collaboratorFunctionId"
      AND collaborator_function."contractId" = membership."contractId"
    WHERE membership."userId" = ${userId}
      AND membership."isActive" = TRUE
      AND app_user."isActive" = TRUE
      AND app_user."type"::text = 'professor'
      AND collaborator_function."isActive" = TRUE
    LIMIT 1
  `);
  const membership = rows[0];
  if (!membership) return null;

  return {
    ...membership,
    role: 'professor',
    source: 'direct-membership',
  };
}

function permissionSubject(actor: ProfessionalActorContext) {
  return {
    role: actor.role,
    collaboratorFunction: {
      id: actor.collaboratorFunctionId,
      code: actor.collaboratorFunctionCode,
    },
  };
}

function applyActor(req: Request, actor: ProfessionalActorContext) {
  const user = req.user! as typeof req.user & Record<string, unknown>;
  user.contractId = actor.contractId;
  user.professorRole = actor.role;
  user.collaboratorFunctionId = actor.collaboratorFunctionId;
  user.collaboratorFunctionCode = actor.collaboratorFunctionCode;
  user.contractType = actor.contractType;
  if (actor.actorProfessorId) user.professorId = actor.actorProfessorId;
  else delete user.professorId;
  (req as Request & { professionalActor?: ProfessionalActorContext }).professionalActor = actor;
}

export function getProfessionalActor(req: Request): ProfessionalActorContext | null {
  return (req as Request & { professionalActor?: ProfessionalActorContext })
    .professionalActor ?? null;
}

export async function getProfessionalActorAccessControl(userId: string) {
  const actor = await resolveProfessionalActor(userId);
  if (!actor) return null;
  if (actor.role === 'master') {
    return { isMaster: true, permissions: buildFullAccessPermissions() };
  }
  const permissions = await syncAccessPermissionsForFunction(
    actor.collaboratorFunctionId,
    actor.collaboratorFunctionCode
  );
  return {
    isMaster: false,
    permissions: permissions.map(serializeAccessPermission),
  };
}

export async function professionalActorMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  if (req.user.type !== 'professor') {
    return res.status(403).json({
      success: false,
      error: 'Apenas profissionais podem acessar este recurso',
    });
  }
  try {
    const actor = await resolveProfessionalActor(req.user.userId);
    if (!actor) {
      return res.status(404).json({
        success: false,
        error: 'Vínculo profissional não encontrado',
      });
    }
    applyActor(req, actor);
    return next();
  } catch (error) {
    console.error('Erro ao resolver vínculo profissional:', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar vínculo profissional',
    });
  }
}

export function professionalScreenAccessMiddleware(screenKey: string | string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const actor = getProfessionalActor(req);
    if (!actor) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }
    try {
      const keys = Array.isArray(screenKey) ? screenKey : [screenKey];
      const checks = await Promise.all(
        keys.map((key) => canProfessorAccessScreen(permissionSubject(actor), key))
      );
      if (!checks.some(Boolean)) {
        return res.status(403).json({
          success: false,
          error: 'Perfil sem permissão para acessar este recurso',
        });
      }
      return next();
    } catch (error) {
      console.error('Erro ao verificar permissão profissional de tela:', {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar permissão de acesso',
      });
    }
  };
}

export function professionalBlockAccessMiddleware(blockKey: string | string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const actor = getProfessionalActor(req);
    if (!actor) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }
    try {
      const keys = Array.isArray(blockKey) ? blockKey : [blockKey];
      const checks = await Promise.all(
        keys.map((key) => canProfessorAccessBlock(permissionSubject(actor), key))
      );
      if (!checks.some(Boolean)) {
        return res.status(403).json({
          success: false,
          error: 'Perfil sem permissão para acessar este recurso',
        });
      }
      return next();
    } catch (error) {
      console.error('Erro ao verificar permissão profissional de bloco:', {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar permissão de acesso',
      });
    }
  };
}
