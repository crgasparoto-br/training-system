import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { POST_WORKOUT_DECISION_ACTIONS } from '@corrida/types';
import type {
  ApplyPostWorkoutDecisionPayload, CreatePostWorkoutDecisionPayload, PostWorkoutDecisionAction,
  PostWorkoutDecisionSource, PostWorkoutDecisionStudentNotice, PostWorkoutDecisionView,
  TransitionPostWorkoutDecisionPayload,
} from '@corrida/types';
import { canProfessorAccessBlock, getEffectiveDataScopeForProfessor } from '../access-control/access-control.service.js';
import { canTransitionDecision, canExposePostWorkoutDecision, isFuturePlanningDate } from './post-workout-decision.domain.js';

const prisma = new PrismaClient();
type Db = PrismaClient | Prisma.TransactionClient;
export type DecisionContext = { contractId: string; alunoId: string; actorProfessorId: string; actorUserId: string };
export type DecisionAction = 'approve' | 'reject' | 'apply';
type Row = Prisma.PostWorkoutDecisionGetPayload<{ include: { adjustment: true } }>;
const include = { adjustment: true } as const;
const allowedActions = new Set<string>(POST_WORKOUT_DECISION_ACTIONS);
export class PostWorkoutDecisionError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT', message: string) {
    super(message); this.name = 'PostWorkoutDecisionError';
  }
}
function fail(code: PostWorkoutDecisionError['code'], message: string): never {
  throw new PostWorkoutDecisionError(code, message);
}
function text(value: string | null | undefined, field: string, max: number) {
  const s = value?.trim();
  if (!s || s.length > max) fail('INVALID_INPUT', field + ' inválido ou ausente.');
  return s;
}
function opKey(value: string) {
  const s = text(value, 'Chave de operação', 128);
  if (s.length < 8) fail('INVALID_INPUT', 'Chave de operação curta.');
  return s;
}
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function effectiveDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_INPUT', 'Data futura inválida.');
  const d = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    fail('INVALID_INPUT', 'Data futura inválida.');
  }
  return d;
}
function project(row: Row): PostWorkoutDecisionView {
  return {
    id: row.id, contractId: row.contractId, alunoId: row.alunoId, workoutDayId: row.workoutDayId,
    sourceFeedbackRevisionId: row.sourceFeedbackRevisionId, trainingPlanId: row.trainingPlanId,
    action: row.action as PostWorkoutDecisionAction, rationale: row.rationale,
    status: row.status as PostWorkoutDecisionView['status'], version: row.version,
    suggestedByProfessorId: row.suggestedByProfessorId, suggestedAt: row.suggestedAt.toISOString(),
    approvedByProfessorId: row.approvedByProfessorId, approvedAt: row.approvedAt?.toISOString() ?? null,
    approvalReason: row.approvalReason, rejectedByProfessorId: row.rejectedByProfessorId,
    rejectedAt: row.rejectedAt?.toISOString() ?? null, rejectionReason: row.rejectionReason,
    appliedByProfessorId: row.appliedByProfessorId, appliedAt: row.appliedAt?.toISOString() ?? null,
    studentMessage: row.studentMessage, exposeToStudent: row.exposeToStudent,
    sourceSnapshot: row.sourceSnapshot as unknown as PostWorkoutDecisionView['sourceSnapshot'],
    adjustment: row.adjustment ? {
      id: row.adjustment.id, version: row.adjustment.version,
      effectiveFrom: row.adjustment.effectiveFrom.toISOString().slice(0, 10),
      instruction: row.adjustment.instruction,
    } : null,
  };
}
async function authorize(db: Db, c: DecisionContext, permission: 'view' | 'suggest' | 'approve' | 'apply') {
  const actor = await db.professor.findFirst({
    where: { id: c.actorProfessorId, contractId: c.contractId, userId: c.actorUserId },
    include: { user: { select: { isActive: true } }, collaboratorFunction: true },
  });
  if (!actor || !actor.user.isActive || !actor.collaboratorFunction.isActive ||
      ['inactive','inativo','dismissed','desligado','terminated','encerrado'].includes(actor.currentStatus?.trim().toLowerCase() ?? '') ||
      (actor.dismissalDate !== null && actor.dismissalDate.getTime() <= Date.now())) {
    fail('FORBIDDEN', 'Profissional sem vínculo ativo.');
  }
  const blockKey = 'students.details.trainingDecisions.' + permission;
  if (!(await canProfessorAccessBlock(actor, blockKey, db))) fail('FORBIDDEN', 'Operação não autorizada.');
  // A grant must be persisted for application, even for a master professor.
  if (permission === 'apply' && !(await db.accessPermission.findFirst({
    where: { collaboratorFunctionId: actor.collaboratorFunctionId,
      screenKey: 'students.details', blockKey, canView: true },
    select: { id: true },
  }))) fail('FORBIDDEN', 'Aplicação exige permissão distinta.');
  // The feedback is a sensitive domain: generic plan access does not expose it.
  if (!(await db.accessPermission.findFirst({
    where: { collaboratorFunctionId: actor.collaboratorFunctionId,
      screenKey: 'students.details', blockKey: 'students.details.postWorkoutFeedback', canView: true },
    select: { id: true },
  }))) fail('FORBIDDEN', 'Acesso ao feedback não autorizado.');
  const scope = await getEffectiveDataScopeForProfessor(actor, 'plans', db);
  if (!scope) fail('FORBIDDEN', 'Escopo de planejamento indisponível.');
  const aluno = await db.aluno.findFirst({
    where: { id: c.alunoId, contractId: c.contractId }, select: { professorId: true },
  });
  if (!aluno) fail('NOT_FOUND', 'Recurso não encontrado.');
  if (scope === 'contract' || aluno.professorId === actor.id) return;
  if (scope !== 'managed' || !aluno.professorId) fail('NOT_FOUND', 'Recurso não encontrado.');
  const responsible = await db.professor.findFirst({
    where: { id: aluno.professorId, contractId: c.contractId }, select: { responsibleManagerId: true },
  });
  if (responsible?.responsibleManagerId !== actor.id) fail('NOT_FOUND', 'Recurso não encontrado.');
}
async function ensurePlan(db: Db, c: DecisionContext, planId: string) {
  const plan = await db.trainingPlan.findFirst({
    where: { id: planId, alunoId: c.alunoId, professor: { contractId: c.contractId } },
    select: { id: true, endDate: true },
  });
  if (!plan) fail('NOT_FOUND', 'Plano do aluno não encontrado.');
  return plan;
}
async function planningVersion(db: Db, planId: string) {
  return (await db.trainingPlanAdjustment.findFirst({
    where: { trainingPlanId: planId }, orderBy: { version: 'desc' }, select: { version: true },
  }))?.version ?? 0;
}
async function addEvent(
  tx: Prisma.TransactionClient, c: DecisionContext, row: Row,
  kind: 'suggested'|'approved'|'rejected'|'applied', planning: number | null = null
) {
  const lifecycle = await tx.studentLifecycleEvent.create({
    data: { alunoId: c.alunoId, contractId: c.contractId, eventType: 'STATUS_CHANGED',
      actorUserId: c.actorUserId, actorProfessorId: c.actorProfessorId,
      metadata: {
        eventKey: 'post-workout-decision:' + row.id + ':v' + row.version,
        domain: 'training_decision', action: kind,
        decisionId: row.id, version: row.version, workoutDayId: row.workoutDayId,
        feedbackRevisionId: row.sourceFeedbackRevisionId, trainingPlanId: row.trainingPlanId,
        ...(planning !== null ? { planningVersion: planning } : {}),
      },
    }, select: { id: true },
  });
  return lifecycle.id;
}
export function createPostWorkoutDecisionService(client: PrismaClient = prisma) {
  return {
    async listForProfessor(c: DecisionContext, cursor?: string) {
      return client.$transaction(async(tx) => {
        await authorize(tx,c,'view');
        if (cursor && !(await tx.postWorkoutDecision.findFirst({
          where: { id: cursor, alunoId: c.alunoId, contractId: c.contractId },
          select: { id: true },
        }))) fail('INVALID_INPUT', 'Cursor do histórico inválido.');
        const rows = await tx.postWorkoutDecision.findMany({
          where: { alunoId: c.alunoId, contractId: c.contractId },
          include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 101,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const page = rows.slice(0, 100);
        const nextCursor = rows.length > 100 ? page[page.length - 1]?.id ?? null : null;
        const planningVersions: Record<string,number> = {};
        for (const planId of new Set(page.map(x => x.trainingPlanId))) {
          planningVersions[planId] = await planningVersion(tx,planId);
        }
        return { decisions: page.map(project), planningVersions, nextCursor };
      });
    },
    async sources(c: DecisionContext): Promise<PostWorkoutDecisionSource[]> {
      return client.$transaction(async(tx) => {
        await authorize(tx,c,'view');
        const rows = await tx.postWorkoutFeedbackRevision.findMany({
          where: { contractId: c.contractId, alunoId: c.alunoId,
            execution: {status: {in: ['completed','partial']}}, },
          orderBy: [{ createdAt: 'desc' }, { revisionNumber: 'desc' }], take: 100,
        });
        const seen = new Set<string>();
        return rows.flatMap(row => {
          const scope = row.workoutDayId + ':' + row.scopeKey;
          if (seen.has(scope)) return [];
          seen.add(scope);
          return [{ workoutDayId: row.workoutDayId, feedbackRevisionId: row.id,
            revisionNumber: row.revisionNumber, scopeKey: row.scopeKey, recordedAt: row.createdAt.toISOString(),
            signals: row.signals as unknown as PostWorkoutDecisionSource['signals'] }];
        });
      });
    },
    async suggest(c: DecisionContext, payload: CreatePostWorkoutDecisionPayload): Promise<PostWorkoutDecisionView> {
      const operationKey = opKey(payload.operationKey);
      const rationale = text(payload.rationale,'Justificativa',2000);
      const studentMessage = payload.studentMessage == null ? null : text(payload.studentMessage,'Mensagem ao aluno',500);
      if (payload.exposeToStudent && !studentMessage) fail('INVALID_INPUT','Informe mensagem prática para o aluno.');
      if (!allowedActions.has(payload.action)) fail('INVALID_INPUT','Ação inválida.');
      const fp = fingerprint({ workoutDayId: payload.workoutDayId, sourceFeedbackRevisionId: payload.sourceFeedbackRevisionId,
        action: payload.action, rationale, studentMessage, exposeToStudent: payload.exposeToStudent === true });
      return client.$transaction(async(tx) => {
        await authorize(tx,c,'suggest');
        const locked = await tx.$queryRawUnsafe<Array<{id:string;originReleaseId:string;originWorkoutTemplateId:string;originTrainingPlanId:string}>>(
          'SELECT "id","originReleaseId","originWorkoutTemplateId","originTrainingPlanId" FROM "WorkoutSessionExecution" WHERE "workoutDayId"=$1 AND "alunoId"=$2 AND "contractId"=$3 AND "status" IN (\'completed\',\'partial\') FOR UPDATE',
          payload.workoutDayId,c.alunoId,c.contractId,
        );
        if (!locked.length) fail('NOT_FOUND','Sessão executada não encontrada.');
        const previous = await tx.postWorkoutDecision.findUnique({
          where: { contractId_alunoId_suggestionKey: {
            contractId:c.contractId,alunoId:c.alunoId,suggestionKey:operationKey,
          } }, include,
        });
        if (previous) {
          if (previous.requestFingerprint !== fp) fail('CONFLICT','Chave reutilizada com outro conteúdo.');
          return project(previous);
        }
        const feedback = await tx.postWorkoutFeedbackRevision.findFirst({
          where: { id:payload.sourceFeedbackRevisionId,workoutDayId:payload.workoutDayId,
            alunoId:c.alunoId,contractId:c.contractId,executionId:locked[0].id },
        });
        if (!feedback) fail('NOT_FOUND','Feedback canônico não encontrado.');
        if (feedback.originReleaseId !== locked[0].originReleaseId ||
            feedback.originWorkoutTemplateId !== locked[0].originWorkoutTemplateId ||
            feedback.originTrainingPlanId !== locked[0].originTrainingPlanId) {
          fail('CONFLICT','O feedback não corresponde à liberação e plano executados.');
        }
        const latest = await tx.postWorkoutFeedbackRevision.findFirst({
          where: { workoutDayId:feedback.workoutDayId,scopeKey:feedback.scopeKey },
          orderBy: {revisionNumber:'desc'}, select:{id:true},
        });
        if (latest?.id !== feedback.id) fail('CONFLICT','O feedback mudou. Atualize antes de sugerir.');
        await ensurePlan(tx,c,feedback.originTrainingPlanId);
        const row = await tx.postWorkoutDecision.create({
          data: { contractId:c.contractId,alunoId:c.alunoId,workoutDayId:payload.workoutDayId,
            sourceFeedbackRevisionId:feedback.id,trainingPlanId:feedback.originTrainingPlanId,
            sourceSnapshot: {
              feedbackRevisionNumber:feedback.revisionNumber,scopeKey:feedback.scopeKey,
              ruleSetVersion:feedback.ruleSetVersion,recordedAt:feedback.createdAt.toISOString(),
              originReleaseId:feedback.originReleaseId,values:feedback.values,signals:feedback.signals,
            } as Prisma.InputJsonValue,
            action:payload.action,rationale,studentMessage,exposeToStudent:payload.exposeToStudent === true,
            suggestionKey:operationKey,requestFingerprint:fp,suggestedByProfessorId:c.actorProfessorId,
          }, include,
        });
        await addEvent(tx,c,row,'suggested');
        return project(row);
      });
    },
    async transition(
      c: DecisionContext, id: string, kind: DecisionAction,
      payload: TransitionPostWorkoutDecisionPayload | ApplyPostWorkoutDecisionPayload
    ): Promise<PostWorkoutDecisionView> {
      const operationKey = opKey(payload.operationKey);
      if (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion <= 0) fail('INVALID_INPUT','Versão inválida.');
      const reason = payload.reason == null ? null : text(payload.reason,'Motivo',1000);
      if (kind === 'reject' && !reason) fail('INVALID_INPUT','A rejeição exige motivo.');
      const applyPayload = kind === 'apply' ? payload as ApplyPostWorkoutDecisionPayload : null;
      if (applyPayload && (!Number.isInteger(applyPayload.expectedPlanningVersion) || applyPayload.expectedPlanningVersion < 0)) {
        fail('INVALID_INPUT','Versão de planejamento inválida.');
      }
      const apply = applyPayload ? {
        expectedPlanningVersion:applyPayload.expectedPlanningVersion,
        effectiveFrom:effectiveDate(applyPayload.effectiveFrom),
        instruction:text(applyPayload.instruction,'Instrução futura',2000),
      } : null;
      const fp = fingerprint({ kind,expectedVersion:payload.expectedVersion,reason,
        ...(apply ? { expectedPlanningVersion:apply.expectedPlanningVersion,
          effectiveFrom:apply.effectiveFrom.toISOString(),instruction:apply.instruction } : {}) });
      return client.$transaction(async(tx) => {
        await authorize(tx,c,kind === 'apply' ? 'apply' : 'approve');
        const locked = await tx.$queryRawUnsafe<Array<{id:string}>>(
          'SELECT "id" FROM "PostWorkoutDecision" WHERE "id"=$1 AND "contractId"=$2 AND "alunoId"=$3 FOR UPDATE',
          id,c.contractId,c.alunoId,
        );
        if (!locked.length) fail('NOT_FOUND','Decisão não encontrada.');
        const current = await tx.postWorkoutDecision.findUnique({where:{id},include});
        if (!current) fail('NOT_FOUND','Decisão não encontrada.');
        const targetPlan = await ensurePlan(tx,c,current.trainingPlanId);
        const prior = await tx.postWorkoutDecisionOperation.findUnique({
          where:{ decisionId_operationKey:{decisionId:id,operationKey} },
        });
        if (prior) {
          if (prior.action !== kind || prior.requestFingerprint !== fp) fail('CONFLICT','Operação reutilizada com outro conteúdo.');
          return project(current);
        }
        if (!canTransitionDecision(current.status as PostWorkoutDecisionView['status'],current.version,kind,payload.expectedVersion)) {
          fail('CONFLICT','A decisão foi modificada. Atualize a página.');
        }
        // Recheck canonical source under the same session lock used by feedback corrections.
        // Historical snapshots remain readable, but stale evidence cannot authorize new effects.
        if (kind !== 'reject') {
          const executionLock = await tx.$queryRawUnsafe<Array<{id:string}>>(
            'SELECT "id" FROM "WorkoutSessionExecution" WHERE "workoutDayId"=$1 AND "alunoId"=$2 AND "contractId"=$3 AND "status" IN (\'completed\',\'partial\') FOR UPDATE',
            current.workoutDayId,c.alunoId,c.contractId,
          );
          if (!executionLock.length) fail('CONFLICT','Sessão de origem deixou de ser válida.');
          const evidence = current.sourceSnapshot as unknown as { scopeKey: string };
          const currentFeedback = await tx.postWorkoutFeedbackRevision.findFirst({
            where: { workoutDayId: current.workoutDayId, scopeKey: evidence.scopeKey,
              alunoId: c.alunoId, contractId: c.contractId },
            orderBy: {revisionNumber: 'desc'}, select: {id:true},
          });
          if (currentFeedback?.id !== current.sourceFeedbackRevisionId) {
            fail('CONFLICT','O feedback de origem mudou. Registre nova sugestão.');
          }
        }
        let planning: number | null = null;
        if (apply) {
          const planLock = await tx.$queryRawUnsafe<Array<{id:string}>>(
            'SELECT "id" FROM "TrainingPlan" WHERE "id"=$1 FOR UPDATE',current.trainingPlanId,
          );
          if (!planLock.length) fail('NOT_FOUND','Plano não encontrado.');
          const currentPlanVersion = await planningVersion(tx,current.trainingPlanId);
          if (currentPlanVersion !== apply.expectedPlanningVersion) fail('CONFLICT','O planejamento mudou. Recarregue-o.');
          if (!isFuturePlanningDate(apply.effectiveFrom,new Date())) fail('INVALID_INPUT','Início deve ser futuro.');
          if (apply.effectiveFrom > targetPlan.endDate) fail('INVALID_INPUT','O início está fora da vigência do plano.');
          planning = currentPlanVersion + 1;
          await tx.trainingPlanAdjustment.create({data:{
            decisionId:id,trainingPlanId:current.trainingPlanId,contractId:c.contractId,alunoId:c.alunoId,
            action:current.action,version:planning,effectiveFrom:apply.effectiveFrom,
            instruction:apply.instruction,appliedByProfessorId:c.actorProfessorId,
            sourceSnapshot:current.sourceSnapshot as Prisma.InputJsonValue,
          }});
        }
        const now = new Date();
        const updated = await tx.postWorkoutDecision.update({where:{id},data:{
          status:kind==='approve' ? 'approved' : kind==='reject' ? 'rejected' : 'applied',
          version:{increment:1},
          ...(kind==='approve' ? {approvedByProfessorId:c.actorProfessorId,approvedAt:now,approvalReason:reason} : {}),
          ...(kind==='reject' ? {rejectedByProfessorId:c.actorProfessorId,rejectedAt:now,rejectionReason:reason} : {}),
          ...(kind==='apply' ? {appliedByProfessorId:c.actorProfessorId,appliedAt:now} : {}),
        },include});
        const eventId = await addEvent(tx,c,updated,updated.status as 'approved'|'rejected'|'applied',planning);
        await tx.postWorkoutDecisionOperation.create({data:{
          decisionId:id,operationKey,action:kind,requestFingerprint:fp,
          resultingVersion:updated.version,lifecycleEventId:eventId,
        }});
        return project(updated);
      },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
    },
    async notices(alunoId:string,contractId:string):Promise<PostWorkoutDecisionStudentNotice[]> {
      const rows = await client.postWorkoutDecision.findMany({
        where:{alunoId,contractId,status:'applied',exposeToStudent:true,studentMessage:{not:null}},
        orderBy:{appliedAt:'desc'},take:30,
      });
      return rows.flatMap(row => canExposePostWorkoutDecision(row.status as PostWorkoutDecisionView['status'],row.exposeToStudent,row.studentMessage) && row.appliedAt ? [{
        id:row.id,action:row.action as PostWorkoutDecisionAction,
        message:row.studentMessage!,appliedAt:row.appliedAt.toISOString(),
      }] : []);
    },
  };
}
export const postWorkoutDecisionService = createPostWorkoutDecisionService();
