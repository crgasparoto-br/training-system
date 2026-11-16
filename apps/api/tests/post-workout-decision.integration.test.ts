import { randomUUID } from 'node:crypto';
import { ContractType, PrismaClient, ProfessorRole, UserType } from '@prisma/client';
import { createPostWorkoutDecisionService, PostWorkoutDecisionError } from '../src/modules/post-workout-feedback/post-workout-decision.service.js';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';

const integration = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true') jest.setTimeout(60_000);

integration('issue #406: canonical decision persistence and review in PostgreSQL',()=>{
  const db=new PrismaClient();
  const peer=new PrismaClient();
  const service=createPostWorkoutDecisionService(db);
  const peerService=createPostWorkoutDecisionService(peer);
  const uuid=()=>randomUUID();
  const future=()=>new Date(Date.now()+30*86400_000).toISOString().slice(0,10);
  type Fixture=Awaited<ReturnType<typeof fixture>>;
  async function fixture() {
    const contractId='issue406-'+uuid();
    await db.companyContract.create({data:{
      id:contractId,type:ContractType.academy,
      document:uuid().replace(/-/g,'').slice(0,14),name:'Test issue 406',
    }});
    const fn=await db.collaboratorFunctionOption.create({data:{
      contractId,name:'Manager',code:'manager',isActive:true,
    }});
    const user=await db.user.create({data:{
      email:'issue406-prof-'+uuid()+'@example.com',passwordHash:'test-hash',type:UserType.professor,
      profile:{create:{name:'Professor #406'}},
    }});
    const prof=await db.professor.create({data:{
      userId:user.id,contractId,collaboratorFunctionId:fn.id,role:ProfessorRole.professor,
    }});
    const studentUser=await db.user.create({data:{
      email:'issue406-student-'+uuid()+'@example.com',passwordHash:'test-hash',type:UserType.aluno,
      profile:{create:{name:'Aluno #406'}},
    }});
    const aluno=await db.aluno.create({data:{
      userId:studentUser.id,professorId:prof.id,contractId,status:'ACTIVE_STUDENT',age:34,
    }});
    const plan=await db.trainingPlan.create({data:{
      professorId:prof.id,alunoId:aluno.id,name:'Plano decision #406',
      startDate:new Date(Date.now()-90*86400_000),endDate:new Date(Date.now()+400*86400_000),
    }});
    const template=await db.workoutTemplate.create({data:{
      planId:plan.id,mesocycleNumber:1,weekNumber:1,weekStartDate:new Date('2026-11-02T00:00:00.000Z'),
      trainingMethod:'combined',
    }});
    const day=await db.workoutDay.create({data:{
      templateId:template.id,dayOfWeek:2,workoutDate:new Date('2026-11-03T00:00:00.000Z'),
      method:'continuous',
    }});
    const execution=await db.workoutSessionExecution.create({data:{
      workoutDayId:day.id,alunoId:aluno.id,contractId,
      originReleaseId:'issue406-release-'+uuid(),originWorkoutTemplateId:template.id,
      originTrainingPlanId:plan.id,status:'completed',
    }});
    const feedback=await db.postWorkoutFeedbackRevision.create({data:{
      workoutDayId:day.id,executionId:execution.id,alunoId:aluno.id,contractId,
      scopeKey:'session',revisionNumber:1,perceptionAuthorActor:'student',
      perceptionAuthorUserId:studentUser.id,revisedByActor:'student',revisedByUserId:studentUser.id,
      values:{pse:6,observations:'Aluno relatou esforço'},
      signals:[{code:'effort_review',severity:'warning',message:'Revisar esforço'}],
      ruleSetVersion:'issue406-test',originReleaseId:execution.originReleaseId,
      originWorkoutTemplateId:template.id,originTrainingPlanId:plan.id,
    }});
    await syncAccessPermissionsForFunction(fn.id,'manager',db);
    const grants=['students.details.postWorkoutFeedback','students.details.trainingDecisions.view',
      'students.details.trainingDecisions.suggest','students.details.trainingDecisions.approve',
      'students.details.trainingDecisions.apply'];
    await db.accessPermission.updateMany({
      where:{collaboratorFunctionId:fn.id,blockKey:{in:grants}},data:{canView:true},
    });
    return {
      c:{contractId,alunoId:aluno.id,actorProfessorId:prof.id,actorUserId:user.id},
      contractId,alunoId:aluno.id,fnId:fn.id,planId:plan.id,dayId:day.id,feedbackId:feedback.id,
      executionId:execution.id,studentUserId:studentUser.id,
    };
  }
  const suggestion=(f:Fixture,override:Record<string,unknown>={})=>({
    operationKey:'suggest-'+uuid(),workoutDayId:f.dayId,sourceFeedbackRevisionId:f.feedbackId,
    action:'reassess' as const,rationale:'Revisar carga de esforço para as próximas sessões.',
    studentMessage:'Converse com seu professor antes de mudar sua rotina.',exposeToStudent:true,
    ...override,
  });
  const operation=(expectedVersion:number)=>({operationKey:'review-'+uuid(),expectedVersion});

  afterAll(async()=>{await Promise.all([db.$disconnect(),peer.$disconnect()]);});
  it('freezes origin; retry across clients does not duplicate a decision, event or version',async()=>{
    const f=await fixture(),payload=suggestion(f);
    const before=await db.workoutDay.findUniqueOrThrow({where:{id:f.dayId}});
    const first=await service.suggest(f.c,payload);
    const replay=await peerService.suggest(f.c,payload);
    expect(first).toMatchObject({status:'suggested',version:1,sourceFeedbackRevisionId:f.feedbackId});
    expect(replay.id).toBe(first.id);
    expect(first.sourceSnapshot.feedbackRevisionNumber).toBe(1);
    expect(first.sourceSnapshot.values).toMatchObject({pse:6});
    expect(await db.postWorkoutDecision.count({where:{id:first.id}})).toBe(1);
    expect(await db.studentLifecycleEvent.count({where:{
      alunoId:f.alunoId,metadata:{path:['decisionId'],equals:first.id},
    }})).toBe(1);
    expect(await db.workoutDay.findUniqueOrThrow({where:{id:f.dayId}})).toEqual(before);
    await expect(service.suggest(f.c,{...payload,rationale:'Outra análise'}))
      .rejects.toMatchObject({code:'CONFLICT'});
  });
  it('requires approval and distinct application, creates one future plan version, hides pending notices',async()=>{
    const f=await fixture();
    const suggested=await service.suggest(f.c,suggestion(f));
    expect(await service.notices(f.alunoId,f.contractId)).toHaveLength(0);
    await expect(service.transition(f.c,suggested.id,'apply',{
      ...operation(1),expectedPlanningVersion:0,effectiveFrom:future(),instruction:'Revisar volume futuro',
    })).rejects.toMatchObject({code:'CONFLICT'});
    const approval=operation(1);
    const approved=await service.transition(f.c,suggested.id,'approve',approval);
    expect(approved).toMatchObject({status:'approved',version:2,approvedByProfessorId:f.c.actorProfessorId});
    expect((await peerService.transition(f.c,suggested.id,'approve',approval)).id).toBe(approved.id);
    expect(await service.notices(f.alunoId,f.contractId)).toHaveLength(0);
    const command={...operation(2),expectedPlanningVersion:0,effectiveFrom:future(),
      instruction:'Revisar volume em futuras sessões sem editar treinos liberados'};
    const applied=await service.transition(f.c,suggested.id,'apply',command);
    expect(applied).toMatchObject({status:'applied',version:3,adjustment:{version:1}});
    expect((await peerService.transition(f.c,suggested.id,'apply',command)).adjustment?.id)
      .toBe(applied.adjustment?.id);
    expect(await db.trainingPlanAdjustment.count({where:{decisionId:suggested.id}})).toBe(1);
    expect(await db.postWorkoutDecisionOperation.count({where:{decisionId:suggested.id}})).toBe(2);
    expect((await service.notices(f.alunoId,f.contractId)).map(x=>x.message))
      .toEqual(['Converse com seu professor antes de mudar sua rotina.']);
    await expect(service.transition(f.c,suggested.id,'reject',operation(3)))
      .rejects.toMatchObject({code:'CONFLICT'});
  });
  it('rejects permanently with reason and forbids direct SQL rewrite or deletion',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await expect(service.transition(f.c,decision.id,'reject',operation(1)))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    const rejected=await service.transition(f.c,decision.id,'reject',{
      ...operation(1),reason:'Não há dados suficientes para uma alteração segura.',
    });
    expect(rejected.status).toBe('rejected');
    await expect(service.transition(f.c,decision.id,'approve',operation(2)))
      .rejects.toMatchObject({code:'CONFLICT'});
    await expect(db.$executeRawUnsafe('UPDATE "PostWorkoutDecision" SET "rationale"=$1 WHERE "id"=$2',
      'Justificativa adulterada',decision.id)).rejects.toThrow();
    await expect(db.$executeRawUnsafe('DELETE FROM "PostWorkoutDecision" WHERE "id"=$1',decision.id)).rejects.toThrow();
    expect(await service.notices(f.alunoId,f.contractId)).toHaveLength(0);
  });
  it('enforces live permission and contract scope, including application permission',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await db.accessPermission.updateMany({where:{collaboratorFunctionId:f.fnId,
      blockKey:'students.details.trainingDecisions.approve'},data:{canView:false}});
    await expect(service.transition(f.c,decision.id,'approve',operation(1)))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    await db.accessPermission.updateMany({where:{collaboratorFunctionId:f.fnId,
      blockKey:'students.details.trainingDecisions.approve'},data:{canView:true}});
    await service.transition(f.c,decision.id,'approve',operation(1));
    await db.accessPermission.updateMany({where:{collaboratorFunctionId:f.fnId,
      blockKey:'students.details.trainingDecisions.apply'},data:{canView:false}});
    await expect(service.transition(f.c,decision.id,'apply',{
      ...operation(2),expectedPlanningVersion:0,effectiveFrom:future(),instruction:'Anotar ajuste futuro',
    })).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
    await expect(service.transition({...f.c,contractId:'foreign-tenant'},decision.id,'approve',operation(2)))
      .rejects.toBeInstanceOf(PostWorkoutDecisionError);
  });
  it('rejects stale evidence but preserves its frozen snapshot',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await db.postWorkoutFeedbackRevision.create({data:{
      workoutDayId:f.dayId,executionId:f.executionId,alunoId:f.alunoId,contractId:f.contractId,
      scopeKey:'session',revisionNumber:2,previousRevisionId:f.feedbackId,
      perceptionAuthorActor:'student',revisedByActor:'professor',correctionReason:'Dados corrigidos',
      values:{pse:8},signals:[],ruleSetVersion:'issue406-test',
      originReleaseId:decision.sourceSnapshot.originReleaseId,
      originWorkoutTemplateId:'unchanged-template',originTrainingPlanId:f.planId,
    }});
    await expect(service.transition(f.c,decision.id,'approve',operation(1)))
      .rejects.toMatchObject({code:'CONFLICT'});
    const stored=(await service.listForProfessor(f.c)).decisions.find(x=>x.id===decision.id);
    expect(stored?.sourceSnapshot.feedbackRevisionNumber).toBe(1);
    expect(stored?.status).toBe('suggested');
  });
  it('serializes competing applications to one plan version',async()=>{
    const f=await fixture();
    const d1=await service.suggest(f.c,suggestion(f));
    const d2=await service.suggest(f.c,suggestion(f,{action:'maintain'}));
    await service.transition(f.c,d1.id,'approve',operation(1));
    await service.transition(f.c,d2.id,'approve',operation(1));
    const command=()=>({...operation(2),expectedPlanningVersion:0,effectiveFrom:future(),instruction:'Plano futuro'});
    const outcomes=await Promise.allSettled([
      service.transition(f.c,d1.id,'apply',command()),
      peerService.transition(f.c,d2.id,'apply',command()),
    ]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect(await db.trainingPlanAdjustment.count({where:{trainingPlanId:f.planId}})).toBe(1);
  });
  it('uses a single transition event for two concurrent clients retrying one approval',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    const command=operation(1);
    const [a,b]=await Promise.all([
      service.transition(f.c,decision.id,'approve',command),
      peerService.transition(f.c,decision.id,'approve',command),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.version).toBe(2);
    expect(await db.postWorkoutDecisionOperation.count({where:{decisionId:decision.id}})).toBe(1);
    expect(await db.studentLifecycleEvent.count({where:{
      alunoId:f.alunoId,metadata:{path:['decisionId'],equals:decision.id},
    }})).toBe(2);
  });
  it('rolls back the decision and audit if creating the target plan version fails',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await service.transition(f.c,decision.id,'approve',operation(1));
    const beforeEvents=await db.studentLifecycleEvent.count({where:{
      alunoId:f.alunoId,metadata:{path:['decisionId'],equals:decision.id},
    }});
    // A NOT VALID constraint still checks new inserts; other tenants are unaffected.
    const constraint='issue406_block_'+uuid().replace(/-/g,'').slice(0,12);
    await db.$executeRawUnsafe(
      'ALTER TABLE "TrainingPlanAdjustment" ADD CONSTRAINT "'+constraint+'" CHECK ("contractId" <> $1) NOT VALID',f.contractId,
    ).catch(async()=>{
      // PostgreSQL does not allow parameter placeholders in ALTER TABLE DDL.
      await db.$executeRawUnsafe(
        'ALTER TABLE "TrainingPlanAdjustment" ADD CONSTRAINT "'+constraint+'" CHECK ("contractId" <> \''+f.contractId+'\') NOT VALID'
      );
    });
    try {
      await expect(service.transition(f.c,decision.id,'apply',{
        ...operation(2),expectedPlanningVersion:0,effectiveFrom:future(),
        instruction:'Alteração de planejamento a ser rejeitada pelo banco',
      })).rejects.toThrow();
      expect((await service.listForProfessor(f.c)).decisions.find(x=>x.id===decision.id)?.status).toBe('approved');
      expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
      expect(await db.postWorkoutDecisionOperation.count({where:{decisionId:decision.id}})).toBe(1);
      expect(await db.studentLifecycleEvent.count({where:{
        alunoId:f.alunoId,metadata:{path:['decisionId'],equals:decision.id},
      }})).toBe(beforeEvents);
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "TrainingPlanAdjustment" DROP CONSTRAINT "'+constraint+'"');
    }
  });

});
