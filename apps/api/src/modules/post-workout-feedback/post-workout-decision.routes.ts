import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, alunoMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { resolveActiveStudentMembership, StudentAccountContextError } from '../alunos/student-account-context.service.js';
import { PostWorkoutDecisionError, postWorkoutDecisionService } from './post-workout-decision.service.js';

const router: Router = Router();
const key = z.string().trim().min(8).max(128);
const id = z.string().trim().min(1).max(128);
const suggestSchema = z.object({
  operationKey:key, workoutDayId:id, sourceFeedbackRevisionId:id,
  action:z.enum(['maintain','progress','reduce','replace','suspend','reassess']),
  rationale:z.string().trim().min(1).max(2000),
  studentMessage:z.string().trim().min(1).max(500).nullable().optional(),
  exposeToStudent:z.boolean().optional(),
}).strict();
const reviewSchema = z.object({
  operationKey:key,expectedVersion:z.number().int().positive(),
  reason:z.string().trim().min(1).max(1000).optional(),
}).strict();
const applySchema = reviewSchema.extend({
  expectedPlanningVersion:z.number().int().nonnegative(),
  effectiveFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instruction:z.string().trim().min(1).max(2000),
}).strict();

function report(res:Response,error:unknown) {
  if (error instanceof z.ZodError) return sendError(res,'Dados inválidos',400,error.errors);
  if (error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')) {
    return sendError(res,'O registro foi alterado por outra operação. Atualize antes de continuar.',409,{code:'CONFLICT'});
  }
  if (error instanceof StudentAccountContextError) {
    return sendError(res,error.message,error.code==='STUDENT_CONTRACT_CONTEXT_REQUIRED'?409:404);
  }
  if (error instanceof PostWorkoutDecisionError) {
    return sendError(res,error.message,{INVALID_INPUT:400,NOT_FOUND:404,FORBIDDEN:403,CONFLICT:409}[error.code],{code:error.code});
  }
  console.error('Falha no fluxo de decisão pós-treino',error);
  return sendError(res,'Não foi possível concluir a operação de decisão.',500);
}

router.get('/student/me',authMiddleware,alunoMiddleware,async(req:Request,res:Response)=>{
  res.set('Cache-Control','no-store');
  try {
    const raw=req.headers['x-contract-id'];
    const requested=typeof raw==='string'?raw.trim():undefined;
    const student=await resolveActiveStudentMembership(req.user!.userId,requested);
    return sendSuccess(res,await postWorkoutDecisionService.notices(student.id,student.contractId),
      'Orientações de treino carregadas');
  } catch(error) {return report(res,error);}
});

router.use(authMiddleware);
router.use(professorMiddleware);
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
function context(req:Request){
  if (!req.user?.contractId || !req.user.professorId) {
    throw new PostWorkoutDecisionError('FORBIDDEN','Vínculo profissional indisponível.');
  }
  return {
    contractId:req.user.contractId,alunoId:req.params.alunoId,
    actorProfessorId:req.user.professorId,actorUserId:req.user.userId,
  };
}
router.get('/alunos/:alunoId/sources',async(req:Request,res:Response)=>{
  try {return sendSuccess(res,await postWorkoutDecisionService.sources(context(req)),'Fontes de feedback carregadas');}
  catch(error){return report(res,error);}
});
router.get('/alunos/:alunoId',async(req:Request,res:Response)=>{
  try {return sendSuccess(res,await postWorkoutDecisionService.listForProfessor(context(req)),'Decisões carregadas');}
  catch(error){return report(res,error);}
});
router.post('/alunos/:alunoId',async(req:Request,res:Response)=>{
  try {return sendSuccess(res,await postWorkoutDecisionService.suggest(context(req),suggestSchema.parse(req.body)),
    'Decisão sugerida registrada',201);}
  catch(error){return report(res,error);}
});
router.post('/alunos/:alunoId/:decisionId/:action',async(req:Request,res:Response)=>{
  try {
    const action=z.enum(['approve','reject','apply']).parse(req.params.action);
    const command=action==='apply'?applySchema.parse(req.body):reviewSchema.parse(req.body);
    return sendSuccess(res,await postWorkoutDecisionService.transition(context(req),req.params.decisionId,action,command),
      'Decisão atualizada');
  } catch(error){return report(res,error);}
});
export default router;
