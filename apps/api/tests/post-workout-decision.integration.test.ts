import { randomUUID } from 'node:crypto';
import { ContractType, Prisma, PrismaClient, ProfessorRole, UserType } from '@prisma/client';
import { createPostWorkoutDecisionService, PostWorkoutDecisionError } from '../src/modules/post-workout-feedback/post-workout-decision.service.js';
import { createWorkoutSessionExecutionService } from '../src/modules/workout/workout-session-execution.service.js';
import { createPostWorkoutFeedbackPersistenceService } from '../src/modules/post-workout-feedback/post-workout-feedback-persistence.service.js';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';

const integration = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true') jest.setTimeout(60_000);

integration('issue #406: canonical decision persistence and review in PostgreSQL',()=>{
  const db=new PrismaClient();
  const peer=new PrismaClient();
  const admin=new PrismaClient();
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
    // Use the real release + session lifecycle (#389/#399). Directly inserting
    // a completed execution is prohibited by the canonical PostgreSQL guard.
    const assembly=await db.consolidatedPrescription.create({data:{
      contractId,alunoId:aluno.id,currentVersion:2,currentStatus:'released',
      createdByProfessorId:prof.id,updatedByProfessorId:prof.id,
    }});
    const approvedVersion=await db.consolidatedPrescriptionVersion.create({data:{
      assemblyId:assembly.id,contractId,alunoId:aluno.id,version:1,status:'approved',
      responsibleProfessorId:prof.id,professorJustification:'Treino autorizado para teste da issue 406.',
      approvedByProfessorId:prof.id,approvedAt:new Date('2026-11-01T12:00:00.000Z'),
      createdByProfessorId:prof.id,conflicts:[],
    }});
    const releasedVersion=await db.consolidatedPrescriptionVersion.create({data:{
      assemblyId:assembly.id,contractId,alunoId:aluno.id,version:2,
      previousVersionId:approvedVersion.id,status:'released',
      responsibleProfessorId:prof.id,professorJustification:approvedVersion.professorJustification,
      approvedByProfessorId:prof.id,approvedAt:approvedVersion.approvedAt,
      createdByProfessorId:prof.id,conflicts:[],
    }});
    const releaseId='issue406-release-'+uuid();
    const releasedAt=new Date('2026-11-02T12:00:00.000Z');
    await db.$executeRawUnsafe(
      'INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (' +
      '"id","assemblyId","sourceAssemblyVersionId","sourceAssemblyVersion",' +
      '"releasedAssemblyVersionId","releasedAssemblyVersion","contractId","alunoId",' +
      '"trainingPlanId","workoutTemplateId","requestFingerprint",' +
      '"releasedByProfessorId","releasedAt","createdAt") VALUES (' +
      '$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      releaseId,assembly.id,approvedVersion.id,1,releasedVersion.id,2,
      contractId,aluno.id,plan.id,template.id,uuid(),prof.id,releasedAt,releasedAt,
    );
    await db.workoutTemplate.update({where:{id:template.id},data:{released:true,releasedAt}});
    const execService=createWorkoutSessionExecutionService(db);
    await execService.transition({sessionId:day.id,alunoId:aluno.id,contractId,
      actorUserId:studentUser.id,payload:{operationKey:'issue406-start-'+uuid(),
        expectedVersion:0,targetStatus:'in_progress'}});
    await execService.transition({sessionId:day.id,alunoId:aluno.id,contractId,
      actorUserId:studentUser.id,payload:{operationKey:'issue406-complete-'+uuid(),
        expectedVersion:1,targetStatus:'completed'}});
    const execution=await db.workoutSessionExecution.findUniqueOrThrow({where:{workoutDayId:day.id}});
    // Feedback also enters through the canonical #390 persistence boundary.
    const feedback=await createPostWorkoutFeedbackPersistenceService(db).createForStudent({
      sessionId:day.id,alunoId:aluno.id,contractId,actorUserId:studentUser.id,
      payload:{operationKey:'issue406-feedback-'+uuid(),
        values:{pse:6,psr:6,painDuring:3,observations:'Aluno relatou esforço'}},
    });
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
      executionId:execution.id,studentUserId:studentUser.id,templateId:template.id,
    };
  }
  const suggestion=(f:Fixture,override:Record<string,unknown>={})=>({
    operationKey:'suggest-'+uuid(),workoutDayId:f.dayId,sourceFeedbackRevisionId:f.feedbackId,
    action:'reassess' as const,rationale:'Revisar carga de esforço para as próximas sessões.',
    studentMessage:'Converse com seu professor antes de mudar sua rotina.',exposeToStudent:true,
    ...override,
  });
  const operation=(expectedVersion:number)=>({operationKey:'review-'+uuid(),expectedVersion});

  afterAll(async()=>{await Promise.all([db.$disconnect(),peer.$disconnect(),admin.$disconnect()]);});
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
    await expect(service.transition(f.c,suggested.id,'reject',{
      ...operation(3),reason:'Decisão já aplicada; rejeição tardia não é permitida.',
    }))
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
  it('rejects SQL-level rejection without a reason, preserving state and audit, then allows a valid review',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    const before=await db.postWorkoutDecision.findUniqueOrThrow({where:{id:decision.id}});
    const eventFilter={alunoId:f.alunoId,metadata:{path:['decisionId'],equals:decision.id}};
    const initialEvents=await db.studentLifecycleEvent.count({where:eventFilter});
    expect(initialEvents).toBe(1);

    for(const invalidReason of [null,'','   ']){
      await expect(db.$executeRaw`
        UPDATE "PostWorkoutDecision"
        SET "status"='rejected',"version"=2,
            "rejectedByProfessorId"=${f.c.actorProfessorId},
            "rejectedAt"=CURRENT_TIMESTAMP,"rejectionReason"=${invalidReason}
        WHERE "id"=${decision.id}
      `).rejects.toThrow(/Invalid rejection reason/);
      expect(await db.postWorkoutDecision.findUniqueOrThrow({where:{id:decision.id}})).toEqual(before);
      expect(await db.studentLifecycleEvent.count({where:eventFilter})).toBe(initialEvents);
      expect(await db.postWorkoutDecisionOperation.count({where:{decisionId:decision.id}})).toBe(0);
      expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
    }

    const reason='Feedback insuficiente para justificar uma nova orientação.';
    const approvedByApi=await service.transition(f.c,decision.id,'reject',{
      ...operation(1),reason,
    });
    expect(approvedByApi).toMatchObject({status:'rejected',version:2,
      rejectionReason:reason,rejectedByProfessorId:f.c.actorProfessorId});
    const persisted=await db.postWorkoutDecision.findUniqueOrThrow({where:{id:decision.id}});
    expect(persisted).toMatchObject({status:'rejected',version:2,
      rejectionReason:reason,rejectedByProfessorId:f.c.actorProfessorId});
    expect(persisted.rejectedAt).not.toBeNull();
    expect(await db.studentLifecycleEvent.count({where:eventFilter})).toBe(initialEvents+1);
    expect(await db.postWorkoutDecisionOperation.count({where:{decisionId:decision.id,action:'reject'}})).toBe(1);
    expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
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
      originWorkoutTemplateId:f.templateId,originTrainingPlanId:f.planId,
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


  it('paginates every older decision and rejects foreign or missing cursors',async()=>{
    const f=await fixture(),first=await service.suggest(f.c,suggestion(f));
    // Test-only historic decisions must satisfy the production SQL audit invariant.
    const history=Array.from({length:100},(_,i)=>({
      id:uuid(),contractId:f.contractId,alunoId:f.alunoId,workoutDayId:f.dayId,
      sourceFeedbackRevisionId:f.feedbackId,trainingPlanId:f.planId,
      sourceSnapshot:first.sourceSnapshot as unknown as Prisma.InputJsonValue,
      action:'maintain',rationale:'Registro histórico '+i,
      studentMessage:null,exposeToStudent:false,suggestedByProfessorId:f.c.actorProfessorId,
      suggestionKey:'history-'+uuid(),requestFingerprint:'test-'+uuid(),
      createdAt:new Date(Date.now()-(i+1)*60_000),
    }));
    await db.$transaction(async tx=>{
      await tx.postWorkoutDecision.createMany({data:history});
      await tx.studentLifecycleEvent.createMany({data:history.map(row=>({
        alunoId:f.alunoId,contractId:f.contractId,eventType:'STATUS_CHANGED',
        actorUserId:f.c.actorUserId,actorProfessorId:f.c.actorProfessorId,
        metadata:{
          eventKey:'post-workout-decision:'+row.id+':v1',domain:'training_decision',
          action:'suggested',decisionId:row.id,version:1,workoutDayId:f.dayId,
          feedbackRevisionId:f.feedbackId,trainingPlanId:f.planId,
        },
      }))});
    });
    const page1=await service.listForProfessor(f.c);
    expect(page1.decisions).toHaveLength(100);
    expect(page1.nextCursor).toBeTruthy();
    const page2=await peerService.listForProfessor(f.c,page1.nextCursor!);
    expect(page2.decisions).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.decisions,...page2.decisions].map(x=>x.id)).size).toBe(101);
    expect(page1.decisions[0].id).toBe(first.id);
    await expect(service.listForProfessor(f.c,'unknown-tenant-cursor'))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
  });
  it('rejects direct SQL-level creation of non-suggested decisions',async()=>{
    const f=await fixture(),baseline=await service.suggest(f.c,suggestion(f));
    const now=new Date();
    for(const state of ['approved','rejected','applied'] as const){
      const fields=state==='approved'
        ? {status:state,version:2,approvedByProfessorId:f.c.actorProfessorId,approvedAt:now}
        : state==='rejected'
        ? {status:state,version:2,rejectedByProfessorId:f.c.actorProfessorId,
          rejectedAt:now,rejectionReason:'Sem evidência suficiente'}
        : {status:state,version:3,approvedByProfessorId:f.c.actorProfessorId,approvedAt:now,
          appliedByProfessorId:f.c.actorProfessorId,appliedAt:now};
      await expect(db.postWorkoutDecision.create({data:{
        contractId:f.contractId,alunoId:f.alunoId,workoutDayId:f.dayId,
        sourceFeedbackRevisionId:f.feedbackId,trainingPlanId:f.planId,
        sourceSnapshot:baseline.sourceSnapshot as unknown as Prisma.InputJsonValue,
        action:'maintain',rationale:'Tentativa de pular a transição obrigatória',
        suggestionKey:'direct-'+uuid(),requestFingerprint:'direct-'+uuid(),
        suggestedByProfessorId:f.c.actorProfessorId,...fields,
      }})).rejects.toThrow(/Invalid initial decision state/);
    }
    expect(await db.postWorkoutDecision.count({where:{alunoId:f.alunoId}})).toBe(1);
    expect(await db.studentLifecycleEvent.count({where:{
      alunoId:f.alunoId,metadata:{path:['decisionId'],equals:baseline.id},
    }})).toBe(1);
  });

  it('checks both planning period boundaries before writing an adjustment',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await service.transition(f.c,decision.id,'approve',operation(1));
    const days=(n:number)=>new Date(Date.now()+n*86400_000);
    await db.trainingPlan.update({where:{id:f.planId},data:{
      startDate:days(40),endDate:days(120),
    }});
    const request=()=>({...operation(2),expectedPlanningVersion:0,
      effectiveFrom:future(),instruction:'Aplicação fora da vigência'});
    await expect(service.transition(f.c,decision.id,'apply',request()))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await db.trainingPlan.update({where:{id:f.planId},data:{
      startDate:days(-90),endDate:days(10),
    }});
    await expect(service.transition(f.c,decision.id,'apply',request()))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
    expect((await service.listForProfessor(f.c)).decisions.find(x=>x.id===decision.id)?.status)
      .toBe('approved');
  });

  async function waitForBlockedStatement(fragment:string){
    for(let attempt=0;attempt<140;attempt++){
      const waiting=await admin.$queryRaw<Array<{pid:number}>>(Prisma.sql`
        SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid()
          AND wait_event_type='Lock' AND state='active' AND position(${fragment} in query)>0
      `);
      if(waiting.length)return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('A operação não chegou ao bloqueio esperado: '+fragment);
  }

  it('accepts the first UTC civil day of a plan even when the stored date has a time',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await service.transition(f.c,decision.id,'approve',operation(1));
    const startDate=new Date(Date.now()+20*86400_000);
    await db.trainingPlan.update({where:{id:f.planId},data:{
      startDate,endDate:new Date(Date.now()+80*86400_000),
    }});
    const result=await service.transition(f.c,decision.id,'apply',{
      ...operation(2),expectedPlanningVersion:0,
      effectiveFrom:startDate.toISOString().slice(0,10),
      instruction:'Aplicar no primeiro dia civil do planejamento',
    });
    expect(result).toMatchObject({status:'applied',adjustment:{version:1}});
    expect(result.adjustment?.effectiveFrom).toBe(startDate.toISOString().slice(0,10));
  });

  it('re-reads a plan period changed by another transaction while waiting for its lock',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await service.transition(f.c,decision.id,'approve',operation(1));
    let notify!:()=>void,release!:()=>void;
    const held=new Promise<void>(resolve=>{notify=resolve;});
    const hold=peer.$transaction(async tx=>{
      await tx.trainingPlan.update({where:{id:f.planId},
        data:{endDate:new Date(Date.now()+10*86400_000)}});
      notify();
      await new Promise<void>(resolve=>{release=resolve;});
    });
    await held;
    const applied=service.transition(f.c,decision.id,'apply',{
      ...operation(2),expectedPlanningVersion:0,effectiveFrom:future(),
      instruction:'Período concorrente inválido',
    });
    try {
      await waitForBlockedStatement('TrainingPlan');
    } finally {
      release();
      await hold;
    }
    await expect(applied).rejects.toMatchObject({code:'CONFLICT'});
    expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
  });

  it('serializes permission revocation after an already authorized operation',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    await service.transition(f.c,decision.id,'approve',operation(1));
    let notify!:()=>void,release!:()=>void;
    const held=new Promise<void>(resolve=>{notify=resolve;});
    const hold=peer.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "PostWorkoutDecision" WHERE "id"=${decision.id} FOR UPDATE
      `);
      notify();
      await new Promise<void>(resolve=>{release=resolve;});
    });
    await held;
    const applied=service.transition(f.c,decision.id,'apply',{
      ...operation(2),expectedPlanningVersion:0,effectiveFrom:future(),
      instruction:'Operação linearizada antes da revogação',
    });
    let revoked=false;
    let revoke:Promise<unknown>|null=null;
    try {
      await waitForBlockedStatement('PostWorkoutDecision');
      revoke=admin.accessPermission.updateMany({where:{
        collaboratorFunctionId:f.fnId,blockKey:'students.details.trainingDecisions.apply',
      },data:{canView:false}}).then(result=>{revoked=true;return result;});
      await new Promise(resolve=>setTimeout(resolve,150));
      expect(revoked).toBe(false);
    } finally {
      release();
      await hold;
    }
    await expect(applied).resolves.toMatchObject({status:'applied',version:3});
    await revoke;
    expect(revoked).toBe(true);
    expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(1);
  });

  it('selects the latest revision of each scope before limiting or paging sources',async()=>{
    const f=await fixture();
    const origin=await db.postWorkoutFeedbackRevision.findUniqueOrThrow({where:{id:f.feedbackId}});
    const second=await createPostWorkoutFeedbackPersistenceService(db).createForStudent({
      sessionId:f.dayId,alunoId:f.alunoId,contractId:f.contractId,actorUserId:f.studentUserId,
      payload:{operationKey:'other-scope-'+uuid(),capacity:'resisted',values:{pse:7}},
    });
    await db.postWorkoutFeedbackRevision.createMany({data:Array.from({length:105},(_,i)=>({
      workoutDayId:f.dayId,executionId:f.executionId,alunoId:f.alunoId,contractId:f.contractId,
      scopeKey:'session',revisionNumber:i+2,previousRevisionId:f.feedbackId,
      perceptionAuthorActor:'student',revisedByActor:'professor',correctionReason:'Revisão histórica',
      values:{pse:8},signals:[],ruleSetVersion:origin.ruleSetVersion,
      originReleaseId:origin.originReleaseId,originWorkoutTemplateId:origin.originWorkoutTemplateId,
      originTrainingPlanId:origin.originTrainingPlanId,
      createdAt:new Date(Date.now()+(i+1)*1000),
    }))});
    const page=await service.sources(f.c);
    expect(page.nextCursor).toBeNull();
    expect(page.sources).toHaveLength(2);
    expect(page.sources.find(x=>x.scopeKey==='session')?.revisionNumber).toBe(106);
    expect(page.sources.find(x=>x.scopeKey==='capacity:resisted')?.feedbackRevisionId).toBe(second.id);
    await expect(service.sources(f.c,'invalid-other-tenant-cursor'))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(service.sources(f.c,f.feedbackId))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
  });


  it('blocks SQL-level insertion of a suggested row without its audit event',async()=>{
    const f=await fixture(),baseline=await service.suggest(f.c,suggestion(f));
    await expect(db.postWorkoutDecision.create({data:{
      contractId:f.contractId,alunoId:f.alunoId,workoutDayId:f.dayId,
      sourceFeedbackRevisionId:f.feedbackId,trainingPlanId:f.planId,
      sourceSnapshot:baseline.sourceSnapshot as unknown as Prisma.InputJsonValue,
      action:'maintain',rationale:'Registro sem auditoria',
      suggestionKey:'unaudited-'+uuid(),requestFingerprint:'unaudited-'+uuid(),
      suggestedByProfessorId:f.c.actorProfessorId,
    }})).rejects.toThrow(/Decision state requires matching lifecycle audit event/);
    expect(await db.postWorkoutDecision.count({where:{alunoId:f.alunoId}})).toBe(1);
  });

  it('blocks SQL-level approvals and rejections with no matching event or operation',async()=>{
    const f=await fixture(),decision=await service.suggest(f.c,suggestion(f));
    const before=await db.postWorkoutDecision.findUniqueOrThrow({where:{id:decision.id}});
    const events=()=>db.studentLifecycleEvent.count({where:{
      alunoId:f.alunoId,metadata:{path:['decisionId'],equals:decision.id},
    }});
    const initialEvents=await events();
    expect(initialEvents).toBe(1);
    for(const kind of ['approve','reject'] as const){
      // Use an autocommit SQL statement: deferred COMMIT errors from an
      // interactive Prisma transaction can be logged without rejecting its Promise.
      const sql=kind==='approve'
        ? 'UPDATE "PostWorkoutDecision" SET "status"=\'approved\',"version"=2,'+
          '"approvedByProfessorId"=$1,"approvedAt"=CURRENT_TIMESTAMP WHERE "id"=$2'
        : 'UPDATE "PostWorkoutDecision" SET "status"=\'rejected\',"version"=2,'+
          '"rejectedByProfessorId"=$1,"rejectedAt"=CURRENT_TIMESTAMP,'+
          '"rejectionReason"=\'Revisão sem trilha\' WHERE "id"=$2';
      await expect(db.$executeRawUnsafe(sql,f.c.actorProfessorId,decision.id))
        .rejects.toThrow(/Decision state requires matching lifecycle audit event/);
      expect(await db.postWorkoutDecision.findUniqueOrThrow({where:{id:decision.id}})).toEqual(before);
      expect(await events()).toBe(initialEvents);
      expect(await db.postWorkoutDecisionOperation.count({where:{decisionId:decision.id}})).toBe(0);
      expect(await db.trainingPlanAdjustment.count({where:{decisionId:decision.id}})).toBe(0);
    }
    const approved=await service.transition(f.c,decision.id,'approve',operation(1));
    expect(approved).toMatchObject({status:'approved',version:2});
    expect(await events()).toBe(initialEvents+1);
    expect(await db.postWorkoutDecisionOperation.count({where:{
      decisionId:decision.id,resultingVersion:2,action:'approve',
    }})).toBe(1);
  });

  it('blocks SQL-level states with incompatible actor and reason fields',async()=>{
    const f=await fixture(),approval=await service.suggest(f.c,suggestion(f));
    await expect(db.$executeRawUnsafe(
      'UPDATE "PostWorkoutDecision" SET "status"=\'approved\',"version"=2,'+
      '"approvedByProfessorId"=$1,"approvedAt"=CURRENT_TIMESTAMP,'+
      '"rejectedByProfessorId"=$1 WHERE "id"=$2',
      f.c.actorProfessorId,approval.id,
    )).rejects.toThrow();
    const rejection=await service.suggest(f.c,suggestion(f));
    await expect(db.$executeRawUnsafe(
      'UPDATE "PostWorkoutDecision" SET "status"=\'rejected\',"version"=2,'+
      '"rejectedByProfessorId"=$1,"rejectedAt"=CURRENT_TIMESTAMP,'+
      '"rejectionReason"=\'Motivo válido\',"approvedByProfessorId"=$1 WHERE "id"=$2',
      f.c.actorProfessorId,rejection.id,
    )).rejects.toThrow();
    expect(await db.postWorkoutDecision.count({where:{
      alunoId:f.alunoId,status:'suggested',
    }})).toBe(2);
    expect(await db.postWorkoutDecisionOperation.count({where:{
      decisionId:{in:[approval.id,rejection.id]},
    }})).toBe(0);
  });
});
