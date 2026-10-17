import { Prisma, PrismaClient } from '@prisma/client';
import { adipometryGovernanceService, buildAdipometrySpecificationHash } from '../adipometry/adipometry-governance.service.js';
import { adipometryService } from '../adipometry/adipometry.service.js';
import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import { readClinicalTimeline, type TimelineClinicalAccess, type TimelineDomainAccess } from './student-clinical-timeline.service.js';
import { studentDomainService } from './student-domain.service.js';

// Only the disposable PostgreSQL database created by CRITICAL validation may
// run these tests. Do not point this suite at a production database.
const databaseDescribe = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const instant = (seconds: number) => new Date(Date.UTC(2030, 0, 3, 12, 0, seconds));

type Fixture = {
  alunoId: string;
  otherAlunoId: string;
  contractId: string;
  otherContractId: string;
  prntEventId: string;
  intakeRevisionIds: string[];
  parqId: string;
  adipometryR1Id: string;
  adipometryR2Id: string;
  anthNewId: string;
  finalizerR1: string;
  finalizerR2: string;
};
let fixture: Fixture;

const fullClinical: TimelineClinicalAccess = {
  prnt: { goal: true }, intake: true, parq: true, anthropometry: true, adipometry: true,
};

databaseDescribe('issue #385: real PostgreSQL canonical clinical timeline', () => {
  beforeAll(async () => {
    const id = stamp();
    // Dedicated contracts/users are intentionally unique; the CI database is
    // disposable and immutable clinical histories are not deleted in cleanup.
    const contract = await prisma.companyContract.create({
      data: { type: 'academy', document: `timeline-385-a-${id}`, name: 'Timeline 385 A' },
    });
    const otherContract = await prisma.companyContract.create({
      data: { type: 'academy', document: `timeline-385-b-${id}`, name: 'Timeline 385 B' },
    });
    const userR1 = await prisma.user.create({
      data: { type: 'professor', email: `timeline-385-r1-${id}@example.invalid`, passwordHash: 'fixture', isActive: true },
    });
    const userR2 = await prisma.user.create({
      data: { type: 'professor', email: `timeline-385-r2-${id}@example.invalid`, passwordHash: 'fixture', isActive: true },
    });
    const functionOption = await prisma.collaboratorFunctionOption.create({
      data: { contractId: contract.id, name: `Timeline 385 ${id}`, code: `TL385-${id}` },
    });
    const professor = await prisma.professor.create({
      data: { userId: userR1.id, contractId: contract.id,
        collaboratorFunctionId: functionOption.id, role: 'master', currentStatus: 'active' },
    });
    // R2 is finalized by a distinct active professor in the same contract.
    await prisma.professor.create({
      data: { userId: userR2.id, contractId: contract.id,
        collaboratorFunctionId: functionOption.id, role: 'master', currentStatus: 'active' },
    });

    // Assign sensitive grants AFTER creating the professors: setup triggers or
    // provisioning may reconcile the function's permissions on first use.
    // Fail at this prerequisite rather than masking three integration tests.
    const governanceBlocks = [
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      'settings.contract.adipometryProtocolApproval',
    ] as const;
    for (const blockKey of governanceBlocks) {
      await prisma.accessPermission.upsert({
        where: { collaboratorFunctionId_screenKey_blockKey: {
          collaboratorFunctionId: functionOption.id,
          screenKey: 'settings.contract',
          blockKey,
        } },
        create: {
          collaboratorFunctionId: functionOption.id,
          screenKey: 'settings.contract',
          blockKey,
          canView: true,
        },
        update: { canView: true },
      });
    }
    const effectiveGrants = await prisma.accessPermission.findMany({
      where: {
        collaboratorFunctionId: professor.collaboratorFunctionId,
        screenKey: 'settings.contract',
        blockKey: { in: [...governanceBlocks] },
        canView: true,
      },
      select: { blockKey: true },
    });
    expect(effectiveGrants.map(({ blockKey }) => blockKey).sort())
      .toEqual([...governanceBlocks].sort());
    await Promise.all([
      prisma.profile.create({
        data: { userId: userR1.id, name: `Timeline 385 R1 ${id}`, cref: `CREF-R1-${id}` },
      }),
      prisma.profile.create({
        data: { userId: userR2.id, name: `Timeline 385 R2 ${id}`, cref: `CREF-R2-${id}` },
      }),
    ]);
    const aluno = await prisma.aluno.create({ data: { contractId: contract.id, professorId: professor.id } });
    await prisma.studentProfile.create({
      data: {
        alunoId: aluno.id,
        contractId: contract.id,
        identificationData: {
          birthDate: '2001-08-03',
          gender: 'male',
        } satisfies Prisma.InputJsonValue,
      },
    });
    const otherAluno = await prisma.aluno.create({ data: { contractId: otherContract.id } });
    const record = await prisma.prontuarioRecord.create({
      data: { contractId: contract.id, alunoId: aluno.id, code: `PRNT-${id}`, professorId: professor.id },
    });
    const prntEvent = await prisma.prontuarioHistoryEvent.create({
      data: { recordId: record.id, contractId: contract.id, alunoId: aluno.id,
        entityType: 'goal', entityId: `goal-${id}`, version: 1, action: 'created',
        snapshot: { privateClinicalValue: 'private-prnt-385' },
        actorUserId: userR1.id, source: 'prnt-api', createdAt: instant(15) },
    });
    const intake = await prisma.studentHealthIntake.create({
      data: { alunoId: aluno.id, contractId: contract.id },
    });
    // The production AFTER INSERT/UPDATE trigger owns intake history. Verify
    // its real behavior instead of attempting an invalid direct revision write.
    await prisma.studentHealthIntake.update({
      where: { id: intake.id },
      data: { observations: 'private-intake-385', recordedByUserId: userR1.id },
    });
    const intakeRevisions = await prisma.studentHealthIntakeRevision.findMany({
      where: { intakeId: intake.id },
      orderBy: { revision: 'asc' },
      select: { id: true },
    });
    const parq = await prisma.studentParqSubmission.create({
      data: { alunoId: aluno.id, contractId: contract.id, sourceType: 'professional',
        submittedByUserId: userR1.id, catalogVersion: '2',
        responses: { secret: 'private-parq-385' }, createdAt: instant(13), submittedAt: instant(13) },
    });

    const anthNewId = `anth-new-${id}`;
    // Two completions for one assessment are replayed source records. Only
    // the newest occurrence may survive, including on older cursor pages.
    await prisma.studentLifecycleEvent.createMany({
      data: [
        { id: anthNewId, alunoId: aluno.id, contractId: contract.id,
          eventType: 'STATUS_CHANGED', actorUserId: userR1.id, createdAt: instant(12),
          metadata: { domain: 'anthropometry', action: 'completed', assessmentId: `anth-${id}` } },
        { id: `anth-duplicate-${id}`, alunoId: aluno.id, contractId: contract.id,
          eventType: 'STATUS_CHANGED', actorUserId: userR2.id, createdAt: instant(11),
          metadata: { domain: 'anthropometry', action: 'completed', assessmentId: `anth-${id}` } },
        { id: `anth-correction-${id}`, alunoId: aluno.id, contractId: contract.id,
          eventType: 'STATUS_CHANGED', actorUserId: userR2.id, createdAt: instant(10),
          metadata: { domain: 'anthropometry', action: 'corrected', assessmentId: `anth-${id}`,
            correctionId: `correction-${id}` } },
        { id: `anth-cross-tenant-${id}`, alunoId: otherAluno.id, contractId: otherContract.id,
          eventType: 'STATUS_CHANGED', actorUserId: userR2.id, createdAt: instant(16),
          metadata: { domain: 'anthropometry', action: 'completed', assessmentId: `private-other-${id}` } },
      ],
    });

    // The production database rejects direct COMPLETED inserts without an
    // approved clinical protocol. Exercise the canonical governance and revision
    // lifecycle so the timeline observes genuine immutable audit events.
    const protocol = await prisma.adipometryProtocol.findFirstOrThrow({
      where: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
    });
    const approvedSpecificationHash = buildAdipometrySpecificationHash({
      code: protocol.code,
      version: protocol.version,
      reference: protocol.reference,
      definitionSnapshot: protocol.definitionSnapshot,
    });
    await adipometryGovernanceService.designate(contract.id, userR1.id, professor.id, {
      professorId: professor.id,
    });
    await adipometryGovernanceService.approve(
      contract.id,
      userR1.id,
      professor.id,
      protocol.code,
      protocol.version,
      {
        approvalStatement: 'Aprovo tecnicamente este protocolo para o contrato descartável de integração.',
        approvedSpecificationHash,
      },
    );

    const draftR1 = await adipometryService.createDraft(
      contract.id, aluno.id, userR1.id, professor.id, { assessmentDate: '2026-08-03' },
    );
    const r1Id = draftR1.id;
    await adipometryService.updateDraft(contract.id, r1Id, userR1.id, {
      protocolCode: protocol.code,
      protocolVersion: protocol.version,
      protocolSex: 'male',
      protocolSexSource: 'profile',
      measurements: { weightKg: 80, tricepsMm: 12, suprailiacMm: 18, abdominalMm: 20 },
    });
    const previewR1 = await adipometryService.calculate(contract.id, r1Id, userR1.id);
    expect(previewR1.canFinalize).toBe(true);
    await adipometryService.finalize(contract.id, r1Id, userR1.id, {
      inputFingerprint: previewR1.inputFingerprint,
    });

    const correction = await adipometryService.startCorrection(
      contract.id,
      r1Id,
      userR2.id,
      'MEASUREMENT_TRANSCRIPTION_ERROR',
      'Correção da dobra abdominal feita por outro profissional.',
    );
    const r2Id = correction.id;
    await adipometryService.updateDraft(contract.id, r2Id, userR2.id, {
      measurements: { abdominalMm: 21 },
    });
    const previewR2 = await adipometryService.calculate(contract.id, r2Id, userR2.id);
    expect(previewR2.canFinalize).toBe(true);
    await adipometryService.finalize(contract.id, r2Id, userR2.id, {
      inputFingerprint: previewR2.inputFingerprint,
    });

    const revisions = await prisma.adipometryAssessment.findMany({
      where: { id: { in: [r1Id, r2Id] }, contractId: contract.id, alunoId: aluno.id },
      select: { id: true, status: true, revisionStatus: true, revisionNumber: true },
    });
    expect(revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: r1Id, status: 'COMPLETED', revisionStatus: 'SUPERSEDED', revisionNumber: 1 }),
      expect.objectContaining({ id: r2Id, status: 'COMPLETED', revisionStatus: 'FINALIZED', revisionNumber: 2 }),
    ]));
    // Assert what the database emitted; do not fabricate AdipometryAuditEvent.
    const clinicalAudit = await prisma.adipometryAuditEvent.findMany({
      where: { contractId: contract.id, assessmentId: { in: [r1Id, r2Id] },
        action: { in: ['COMPLETED', 'CORRECTION_FINALIZED'] } },
      select: { assessmentId: true, action: true, actorUserId: true },
    });
    expect(clinicalAudit).toEqual(expect.arrayContaining([
      expect.objectContaining({ assessmentId: r1Id, action: 'COMPLETED', actorUserId: userR1.id }),
      expect.objectContaining({ assessmentId: r2Id, action: 'CORRECTION_FINALIZED', actorUserId: userR2.id }),
    ]));

    fixture = {
      alunoId: aluno.id, otherAlunoId: otherAluno.id,
      contractId: contract.id, otherContractId: otherContract.id,
      prntEventId: prntEvent.id, intakeRevisionIds: intakeRevisions.map((revision) => revision.id), parqId: parq.id,
      adipometryR1Id: r1Id, adipometryR2Id: r2Id, anthNewId,
      finalizerR1: userR1.id, finalizerR2: userR2.id,
    };
  }, 60000);

  afterAll(async () => {
    await prismaRuntimeClient.$disconnect();
    await prisma.$disconnect();
  });

  it('projects real immutable clinical sources without exposing clinical snapshots', async () => {
    const result = await readClinicalTimeline(fixture.alunoId, fixture.contractId, fullClinical, 50);
    expect(result.unavailableDomains).toEqual([]);
    expect(result.items.map((item) => item.sourceId).sort()).toEqual([
      fixture.prntEventId, ...fixture.intakeRevisionIds, fixture.parqId,
      fixture.adipometryR1Id, fixture.adipometryR2Id,
      `anth-${fixture.anthNewId.slice('anth-new-'.length)}`,
      `correction-${fixture.anthNewId.slice('anth-new-'.length)}`,
    ].sort());
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'prontuario-history-event',
        sourceId: fixture.prntEventId, contractId: fixture.contractId }),
      expect.objectContaining({ sourceType: 'student-health-intake-revision',
        sourceId: fixture.intakeRevisionIds[1] }),
      expect.objectContaining({ sourceType: 'adipometry-assessment',
        sourceId: fixture.adipometryR1Id, actorUserId: fixture.finalizerR1 }),
      expect.objectContaining({ sourceType: 'adipometry-assessment',
        sourceId: fixture.adipometryR2Id, actorUserId: fixture.finalizerR2,
        metadata: expect.objectContaining({ correctsAssessmentId: fixture.adipometryR1Id }) }),
    ]));
    expect(JSON.stringify(result)).not.toContain('private-prnt-385');
    expect(JSON.stringify(result)).not.toContain('private-intake-385');
    expect(JSON.stringify(result)).not.toContain('private-parq-385');
  });

  it('enforces partial grants and tenant scope using real PostgreSQL reads', async () => {
    const denied = await readClinicalTimeline(fixture.alunoId, fixture.contractId, {
      prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false,
    }, 20);
    expect(denied.items).toEqual([]);
    const onlyPrnt = await readClinicalTimeline(fixture.alunoId, fixture.contractId, {
      prnt: { goal: true }, intake: false, parq: false, anthropometry: false, adipometry: false,
    }, 20);
    expect(onlyPrnt.items.map((item) => item.sourceId)).toEqual([fixture.prntEventId]);
    const wrongTenant = await readClinicalTimeline(fixture.alunoId, fixture.otherContractId, fullClinical, 20);
    expect(wrongTenant.items).toEqual([]);
    const otherTenant = await readClinicalTimeline(fixture.otherAlunoId, fixture.otherContractId,
      { ...fullClinical, prnt: {}, intake: false, parq: false, adipometry: false }, 20);
    expect(otherTenant.items).toHaveLength(1);
    expect(otherTenant.items[0].sourceId).toContain('private-other-');
  });

  it('paginates multiple real canonical domains without replaying an older ANTR duplicate', async () => {
    const grants: TimelineDomainAccess = {
      profile: false, health: false, assessments: false, financial: false,
      integrations: false, training: false, clinical: fullClinical,
    };
    const seen: string[] = [];
    let nextCursor: string | null | undefined = undefined;
    for (let page = 0; page < 16; page++) {
      const result = await studentDomainService.getTimeline(fixture.alunoId, {
        companyContractId: fixture.contractId, timelineAccess: grants,
        timelineLimit: 2, timelineCursor: nextCursor ?? undefined,
      });
      expect(result).not.toBeNull();
      seen.push(...result!.items.map((event) => event.id));
      nextCursor = result!.nextCursor;
      if (!nextCursor) break;
    }
    const unique = new Set(seen);
    expect(unique.size).toBe(seen.length);
    expect(seen).toContain(`clinical-anthropometry-${fixture.anthNewId}`);
    expect(seen.filter((id) => id.startsWith('clinical-anthropometry-') && !id.includes('correction'))).toHaveLength(1);
    expect(seen).toContain(`clinical-adipometry-${fixture.adipometryR1Id}`);
    expect(seen).toContain(`clinical-adipometry-${fixture.adipometryR2Id}`);
    expect(nextCursor).toBeNull();
  });
});
