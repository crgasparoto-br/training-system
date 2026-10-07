import { createHash } from 'node:crypto';
import { Prisma, PrismaClient, type PostWorkoutFeedbackRevision, type WorkoutSessionExecutionStatus } from '@prisma/client';
import {
  POST_WORKOUT_FEEDBACK_RULE_SET_VERSION,
  type CanonicalPostWorkoutFeedbackRevisionView,
  type CanonicalPostWorkoutFeedbackValues,
  type CorrectCanonicalPostWorkoutFeedbackPayload,
  type CreateCanonicalPostWorkoutFeedbackPayload,
  type PhysicalCapacityType,
  type PostWorkoutFeedbackActor,
  type PostWorkoutFeedbackSignal,
  type TrainingRoutineAudience,
} from '@corrida/types';

const prisma = new PrismaClient();
const TERMINAL = new Set<WorkoutSessionExecutionStatus>(['completed', 'partial']);
const CAPACITIES = new Set<PhysicalCapacityType>(['resisted', 'flexibility', 'cyclic', 'balance']);

type LockedExecution = {
  id:string; workoutDayId:string; alunoId:string; contractId:string; status:WorkoutSessionExecutionStatus;
  originReleaseId:string; originWorkoutTemplateId:string; originTrainingPlanId:string;
};
export class PostWorkoutFeedbackInputError extends Error { readonly statusCode=400; readonly code='POST_WORKOUT_FEEDBACK_INVALID'; }
export class PostWorkoutFeedbackNotFoundError extends Error { readonly statusCode=404; readonly code='POST_WORKOUT_FEEDBACK_SESSION_NOT_FOUND'; }
export class PostWorkoutFeedbackConflictError extends Error {
  readonly statusCode=409;
  constructor(message:string,readonly code:'POST_WORKOUT_FEEDBACK_SESSION_NOT_TERMINAL'|'POST_WORKOUT_FEEDBACK_ALREADY_CONFIRMED'|'POST_WORKOUT_FEEDBACK_IDEMPOTENCY_CONFLICT'|'POST_WORKOUT_FEEDBACK_REVISION_CONFLICT'){super(message);}
}
const emptyValues=():CanonicalPostWorkoutFeedbackValues=>({
  pse:null,psr:null,painBefore:null,painDuring:null,painAfter:null,painLocation:null,difficulty:null,
  fatigueLevel:null,energyLevel:null,sleepQuality:null,dizziness:null,observations:null,professorTechnicalNotes:null,
});
function normalizeText(value:string|null|undefined,max:number){if(value===undefined)return undefined;if(value===null)return null;const v=value.trim();if(v.length>max)throw new PostWorkoutFeedbackInputError(`Texto deve ter no máximo ${max} caracteres.`);return v||null;}
function scale(value:number|null|undefined,field:string){if(value!==undefined&&value!==null&&(!Number.isInteger(value)||value<0||value>10))throw new PostWorkoutFeedbackInputError(`${field} deve ser um inteiro de 0 a 10.`);return value;}
export function normalizePostWorkoutFeedbackValues(patch:Partial<CanonicalPostWorkoutFeedbackValues>):Partial<CanonicalPostWorkoutFeedbackValues>{
  if(patch.fatigueLevel!==undefined&&patch.fatigueLevel!==null&&!['low','medium','high'].includes(patch.fatigueLevel))throw new PostWorkoutFeedbackInputError('Fadiga inválida.');
  if(patch.energyLevel!==undefined&&patch.energyLevel!==null&&!['good','medium','poor'].includes(patch.energyLevel))throw new PostWorkoutFeedbackInputError('Energia inválida.');
  if(patch.sleepQuality!==undefined&&patch.sleepQuality!==null&&!['good','medium','poor'].includes(patch.sleepQuality))throw new PostWorkoutFeedbackInputError('Sono inválido.');
  return {
    ...(patch.pse!==undefined?{pse:scale(patch.pse,'PSE')??null}:{}),...(patch.psr!==undefined?{psr:scale(patch.psr,'PSR')??null}:{}),
    ...(patch.painBefore!==undefined?{painBefore:scale(patch.painBefore,'Dor antes')??null}:{}),...(patch.painDuring!==undefined?{painDuring:scale(patch.painDuring,'Dor durante')??null}:{}),
    ...(patch.painAfter!==undefined?{painAfter:scale(patch.painAfter,'Dor depois')??null}:{}),...(patch.difficulty!==undefined?{difficulty:scale(patch.difficulty,'Dificuldade')??null}:{}),
    ...(patch.painLocation!==undefined?{painLocation:normalizeText(patch.painLocation,160)??null}:{}),...(patch.observations!==undefined?{observations:normalizeText(patch.observations,1000)??null}:{}),
    ...(patch.professorTechnicalNotes!==undefined?{professorTechnicalNotes:normalizeText(patch.professorTechnicalNotes,1000)??null}:{}),
    ...(patch.fatigueLevel!==undefined?{fatigueLevel:patch.fatigueLevel??null}:{}),...(patch.energyLevel!==undefined?{energyLevel:patch.energyLevel??null}:{}),
    ...(patch.sleepQuality!==undefined?{sleepQuality:patch.sleepQuality??null}:{}),...(patch.dizziness!==undefined?{dizziness:patch.dizziness??null}:{}),
  };
}
function merge(current:CanonicalPostWorkoutFeedbackValues|null,patch:Partial<CanonicalPostWorkoutFeedbackValues>):CanonicalPostWorkoutFeedbackValues{return {...(current??emptyValues()),...patch};}
function maxPain(v:CanonicalPostWorkoutFeedbackValues){const xs=[v.painBefore,v.painDuring,v.painAfter].filter((x):x is number=>typeof x==='number');return xs.length?Math.max(...xs):null;}
export function evaluatePostWorkoutFeedbackSignals(v:CanonicalPostWorkoutFeedbackValues):PostWorkoutFeedbackSignal[]{
  const out:PostWorkoutFeedbackSignal[]=[];const pain=maxPain(v);
  if(pain!==null){
    if(pain<=2)out.push({code:'pain_green',severity:'info',painTriage:'green',studentMessage:'Dor registrada na faixa verde da regra atual.',technicalMessage:'Dor 0–2: faixa verde do contrato canônico.',requiresFollowUp:false,changesWorkoutAutomatically:false});
    else if(pain<=4)out.push({code:'pain_attention',severity:'warning',painTriage:'attention',studentMessage:'O desconforto informado merece atenção. Se persistir ou piorar, converse com seu professor.',technicalMessage:'Dor 3–4: atenção e acompanhamento conforme contexto.',requiresFollowUp:true,changesWorkoutAutomatically:false});
    else out.push({code:'pain_alert',severity:'critical',painTriage:'alert',studentMessage:'O desconforto informado precisa de acompanhamento. Converse com seu professor antes de decidir como seguir.',technicalMessage:'Dor >4: alerta para acompanhamento; nenhuma decisão é aplicada automaticamente.',requiresFollowUp:true,changesWorkoutAutomatically:false});
  }
  if(v.dizziness===true)out.push({code:'dizziness',severity:'critical',painTriage:null,studentMessage:'Você informou tontura. Avise seu professor para acompanhamento.',technicalMessage:'Tontura informada no feedback pós-treino; requer acompanhamento.',requiresFollowUp:true,changesWorkoutAutomatically:false});
  if(v.fatigueLevel==='high')out.push({code:'fatigue_high',severity:'warning',painTriage:null,studentMessage:'Fadiga alta registrada. Compartilhe com seu professor se ela persistir.',technicalMessage:'Fadiga alta registrada; sinalizar para acompanhamento sem alterar prescrição.',requiresFollowUp:true,changesWorkoutAutomatically:false});
  return out;
}
const fp=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function scopeFor(capacity:PhysicalCapacityType|null|undefined){if(capacity==null)return{scopeKey:'session',capacity:null};if(!CAPACITIES.has(capacity))throw new PostWorkoutFeedbackInputError('Capacidade inválida.');return{scopeKey:`capacity:${capacity}`,capacity};}
function opKey(v:string){const x=v.trim();if(x.length<8||x.length>128)throw new PostWorkoutFeedbackInputError('Chave da operação inválida.');return x;}
async function lockExecution(tx:Prisma.TransactionClient,sessionId:string,alunoId:string,contractId:string){
  const rows=await tx.$queryRaw<LockedExecution[]>(Prisma.sql`SELECT e."id",e."workoutDayId",e."alunoId",e."contractId",e."status"::text AS "status",e."originReleaseId",e."originWorkoutTemplateId",e."originTrainingPlanId" FROM "WorkoutSessionExecution" e WHERE e."workoutDayId"=${sessionId} AND e."alunoId"=${alunoId} AND e."contractId"=${contractId} LIMIT 1 FOR UPDATE OF e`);
  return rows[0]??null;
}
const valuesOf=(row:PostWorkoutFeedbackRevision)=>row.values as unknown as CanonicalPostWorkoutFeedbackValues;
export function projectPostWorkoutFeedback(row:PostWorkoutFeedbackRevision,status:WorkoutSessionExecutionStatus,audience:TrainingRoutineAudience,current=true):CanonicalPostWorkoutFeedbackRevisionView{
  if(!TERMINAL.has(status))throw new PostWorkoutFeedbackConflictError('A sessão ainda não aceita feedback pós-treino.','POST_WORKOUT_FEEDBACK_SESSION_NOT_TERMINAL');
  return{id:row.id,sessionId:row.workoutDayId,executionId:row.executionId,executionStatus:status as 'completed'|'partial',scopeKey:row.scopeKey,capacity:row.capacity as PhysicalCapacityType|null,revisionNumber:row.revisionNumber,previousRevisionId:row.previousRevisionId,correctionReason:row.correctionReason,perceptionAuthor:row.perceptionAuthorActor as PostWorkoutFeedbackActor,revisedBy:row.revisedByActor as PostWorkoutFeedbackActor,createdAt:row.createdAt.toISOString(),values:valuesOf(row),signals:row.signals as unknown as PostWorkoutFeedbackSignal[],current,...(audience==='professor'?{technical:{ruleSetVersion:row.ruleSetVersion,originReleaseId:row.originReleaseId,originWorkoutTemplateId:row.originWorkoutTemplateId,originTrainingPlanId:row.originTrainingPlanId}}:{})};
}
export function createPostWorkoutFeedbackPersistenceService(client:PrismaClient=prisma){
  async function currentRows(sessionId:string,alunoId:string,contractId:string){
    const rows=await client.postWorkoutFeedbackRevision.findMany({where:{workoutDayId:sessionId,alunoId,contractId},orderBy:[{scopeKey:'asc'},{revisionNumber:'desc'}]});
    const seen=new Set<string>();return rows.filter((row)=>{if(seen.has(row.scopeKey))return false;seen.add(row.scopeKey);return true;});
  }
  return{
    async getForSession(input:{sessionId:string;alunoId:string;contractId:string;audience:TrainingRoutineAudience;includeHistory?:boolean}){
      const execution=await client.workoutSessionExecution.findFirst({where:{workoutDayId:input.sessionId,alunoId:input.alunoId,contractId:input.contractId}});
      if(!execution)throw new PostWorkoutFeedbackNotFoundError('Sessão executada não encontrada.');
      const current=await currentRows(input.sessionId,input.alunoId,input.contractId);
      const rows=input.includeHistory?await client.postWorkoutFeedbackRevision.findMany({where:{workoutDayId:input.sessionId,alunoId:input.alunoId,contractId:input.contractId},orderBy:[{scopeKey:'asc'},{revisionNumber:'desc'}]}):current;
      const ids=new Set(current.map((row)=>row.id));return rows.map((row)=>projectPostWorkoutFeedback(row,execution.status,input.audience,ids.has(row.id)));
    },
    async createForStudent(input:{sessionId:string;alunoId:string;contractId:string;actorUserId:string;payload:CreateCanonicalPostWorkoutFeedbackPayload}){
      const key=opKey(input.payload.operationKey);const scope=scopeFor(input.payload.capacity);const values=merge(null,normalizePostWorkoutFeedbackValues(input.payload.values));
      if(!Object.values(values).some((v)=>v!==null))throw new PostWorkoutFeedbackInputError('Informe pelo menos um dado do feedback.');
      const fingerprint=fp({action:'create',...scope,values});
      return client.$transaction(async(tx)=>{
        const execution=await lockExecution(tx,input.sessionId,input.alunoId,input.contractId);
        if(!execution)throw new PostWorkoutFeedbackNotFoundError('Sessão executada não encontrada.');
        if(!TERMINAL.has(execution.status))throw new PostWorkoutFeedbackConflictError('O feedback só pode ser confirmado após uma execução concluída ou parcial.','POST_WORKOUT_FEEDBACK_SESSION_NOT_TERMINAL');
        const prior=await tx.postWorkoutFeedbackOperation.findUnique({where:{workoutDayId_scopeKey_operationKey:{workoutDayId:input.sessionId,scopeKey:scope.scopeKey,operationKey:key}},include:{resultingRevision:true}});
        if(prior){if(prior.payloadFingerprint!==fingerprint)throw new PostWorkoutFeedbackConflictError('A mesma chave de operação já foi usada com dados diferentes.','POST_WORKOUT_FEEDBACK_IDEMPOTENCY_CONFLICT');return projectPostWorkoutFeedback(prior.resultingRevision,execution.status,'student',true);}
        const existing=await tx.postWorkoutFeedbackRevision.findFirst({where:{workoutDayId:input.sessionId,scopeKey:scope.scopeKey},orderBy:{revisionNumber:'desc'}});
        if(existing)throw new PostWorkoutFeedbackConflictError('Este feedback já foi confirmado e está somente leitura.','POST_WORKOUT_FEEDBACK_ALREADY_CONFIRMED');
        const signals=evaluatePostWorkoutFeedbackSignals(values);
        const revision=await tx.postWorkoutFeedbackRevision.create({data:{workoutDayId:input.sessionId,executionId:execution.id,alunoId:input.alunoId,contractId:input.contractId,scopeKey:scope.scopeKey,capacity:scope.capacity,revisionNumber:1,perceptionAuthorActor:'student',perceptionAuthorUserId:input.actorUserId,revisedByActor:'student',revisedByUserId:input.actorUserId,values:values as unknown as Prisma.InputJsonValue,signals:signals as unknown as Prisma.InputJsonValue,ruleSetVersion:POST_WORKOUT_FEEDBACK_RULE_SET_VERSION,originReleaseId:execution.originReleaseId,originWorkoutTemplateId:execution.originWorkoutTemplateId,originTrainingPlanId:execution.originTrainingPlanId}});
        const op=await tx.postWorkoutFeedbackOperation.create({data:{workoutDayId:input.sessionId,scopeKey:scope.scopeKey,operationKey:key,payloadFingerprint:fingerprint,action:'create',resultingRevisionId:revision.id}});
        const event=await tx.studentLifecycleEvent.create({data:{alunoId:input.alunoId,contractId:input.contractId,eventType:'STATUS_CHANGED',actorUserId:input.actorUserId,metadata:{eventKey:`post-workout-feedback:${revision.id}`,domain:'post_workout_feedback',action:'created',workoutDayId:input.sessionId,executionId:execution.id,revisionId:revision.id,revisionNumber:1,scopeKey:scope.scopeKey,ruleSetVersion:POST_WORKOUT_FEEDBACK_RULE_SET_VERSION,signalCodes:signals.map((s)=>s.code)}},select:{id:true}});
        await tx.postWorkoutFeedbackOperation.update({where:{id:op.id},data:{lifecycleEventId:event.id}});return projectPostWorkoutFeedback(revision,execution.status,'student',true);
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    },
    async correctForProfessor(input:{sessionId:string;alunoId:string;contractId:string;actorUserId:string;payload:CorrectCanonicalPostWorkoutFeedbackPayload}){
      const key=opKey(input.payload.operationKey);const reason=normalizeText(input.payload.reason,500);if(!reason)throw new PostWorkoutFeedbackInputError('Motivo da correção é obrigatório.');
      const patch=normalizePostWorkoutFeedbackValues(input.payload.values);const fingerprint=fp({action:'correct',baseRevisionId:input.payload.baseRevisionId,reason,values:patch});
      return client.$transaction(async(tx)=>{
        const execution=await lockExecution(tx,input.sessionId,input.alunoId,input.contractId);if(!execution)throw new PostWorkoutFeedbackNotFoundError('Sessão executada não encontrada.');
        if(!TERMINAL.has(execution.status))throw new PostWorkoutFeedbackConflictError('A sessão ainda não aceita correção de feedback.','POST_WORKOUT_FEEDBACK_SESSION_NOT_TERMINAL');
        const base=await tx.postWorkoutFeedbackRevision.findFirst({where:{id:input.payload.baseRevisionId,workoutDayId:input.sessionId,alunoId:input.alunoId,contractId:input.contractId}});if(!base)throw new PostWorkoutFeedbackNotFoundError('Revisão de feedback não encontrada.');
        const prior=await tx.postWorkoutFeedbackOperation.findUnique({where:{workoutDayId_scopeKey_operationKey:{workoutDayId:input.sessionId,scopeKey:base.scopeKey,operationKey:key}},include:{resultingRevision:true}});
        if(prior){if(prior.payloadFingerprint!==fingerprint)throw new PostWorkoutFeedbackConflictError('A mesma chave de operação já foi usada com dados diferentes.','POST_WORKOUT_FEEDBACK_IDEMPOTENCY_CONFLICT');return projectPostWorkoutFeedback(prior.resultingRevision,execution.status,'professor',true);}
        const current=await tx.postWorkoutFeedbackRevision.findFirst({where:{workoutDayId:input.sessionId,scopeKey:base.scopeKey},orderBy:{revisionNumber:'desc'}});
        if(!current||current.id!==base.id)throw new PostWorkoutFeedbackConflictError('O feedback foi revisado por outro cliente. Atualize antes de corrigir.','POST_WORKOUT_FEEDBACK_REVISION_CONFLICT');
        const values=merge(valuesOf(base),patch);const signals=evaluatePostWorkoutFeedbackSignals(values);
        const revision=await tx.postWorkoutFeedbackRevision.create({data:{workoutDayId:base.workoutDayId,executionId:base.executionId,alunoId:base.alunoId,contractId:base.contractId,scopeKey:base.scopeKey,capacity:base.capacity,revisionNumber:base.revisionNumber+1,previousRevisionId:base.id,perceptionAuthorActor:base.perceptionAuthorActor,perceptionAuthorUserId:base.perceptionAuthorUserId,revisedByActor:'professor',revisedByUserId:input.actorUserId,correctionReason:reason,values:values as unknown as Prisma.InputJsonValue,signals:signals as unknown as Prisma.InputJsonValue,ruleSetVersion:POST_WORKOUT_FEEDBACK_RULE_SET_VERSION,originReleaseId:base.originReleaseId,originWorkoutTemplateId:base.originWorkoutTemplateId,originTrainingPlanId:base.originTrainingPlanId}});
        const op=await tx.postWorkoutFeedbackOperation.create({data:{workoutDayId:input.sessionId,scopeKey:base.scopeKey,operationKey:key,payloadFingerprint:fingerprint,action:'correct',baseRevisionId:base.id,resultingRevisionId:revision.id}});
        const event=await tx.studentLifecycleEvent.create({data:{alunoId:input.alunoId,contractId:input.contractId,eventType:'STATUS_CHANGED',actorUserId:input.actorUserId,metadata:{eventKey:`post-workout-feedback:${revision.id}`,domain:'post_workout_feedback',action:'corrected',workoutDayId:input.sessionId,executionId:execution.id,revisionId:revision.id,previousRevisionId:base.id,revisionNumber:revision.revisionNumber,scopeKey:base.scopeKey,correctionReason:reason,changedFields:Object.keys(patch),ruleSetVersion:POST_WORKOUT_FEEDBACK_RULE_SET_VERSION,signalCodes:signals.map((s)=>s.code)}},select:{id:true}});
        await tx.postWorkoutFeedbackOperation.update({where:{id:op.id},data:{lifecycleEventId:event.id}});return projectPostWorkoutFeedback(revision,execution.status,'professor',true);
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    },
  };
}
export const postWorkoutFeedbackPersistenceService=createPostWorkoutFeedbackPersistenceService();
