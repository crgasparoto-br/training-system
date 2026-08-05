import { Prisma } from '@prisma/client';
import type {
  AdipometryCalculationSnapshot,
  AdipometryProtocolDefinitionSnapshot,
  CreateAdipometryDraftInput,
  UpdateAdipometryDraftInput,
} from '@corrida/types';
import {
  AdipometryServiceError,
  adipometryService,
} from './adipometry.service.js';
import {
  hasAdipometryProtocolSexDecisionPatch,
  mergeAdipometryProtocolSexDecisionPatch,
} from './adipometry-protocol-sex-decision.js';
import { buildAdipometryProtocolPresentation } from './adipometry-protocol-presentation.js';
import {
  adipometryRuntimePrisma,
  getAdipometryApprovedProtocol,
  getAdipometryAssessmentRow,
  getAdipometryProfile,
  runAdipometrySerializableTransaction,
  setAdipometryActor,
} from './adipometry-runtime-db.js';
import {
  assertAdipometryProtocolSexSource,
  buildHardenedAdipometryPreview,
} from './adipometry-runtime-preview.js';

let installed = false;

export function installAdipometryRuntimeHardening() {
  if (installed) return;
  installed = true;

  const originalListAvailableProtocols =
    adipometryService.listAvailableProtocols.bind(adipometryService);
  const originalCreateDraft = adipometryService.createDraft.bind(adipometryService);
  const originalUpdateDraft = adipometryService.updateDraft.bind(adipometryService);
  const originalGetAssessment = adipometryService.getAssessment.bind(adipometryService);

  adipometryService.listAvailableProtocols = async (
    contractId: string,
    alunoId: string,
    assessmentDate?: string
  ) => {
    const protocols = await originalListAvailableProtocols(
      contractId,
      alunoId,
      assessmentDate
    );

    const definitions = await adipometryRuntimePrisma.$queryRaw<Array<{
      protocolCode: string;
      protocolVersion: number;
      definitionSnapshot: AdipometryProtocolDefinitionSnapshot;
    }>>(Prisma.sql`
      SELECT
        protocol.code AS "protocolCode",
        protocol.version AS "protocolVersion",
        approval."protocolDefinitionSnapshot" AS "definitionSnapshot"
      FROM "AdipometryProtocol" protocol
      JOIN "AdipometryProtocolApproval" approval
        ON approval."protocolId" = protocol.id
       AND approval."protocolCode" = protocol.code
       AND approval."protocolVersion" = protocol.version
      WHERE approval."contractId" = ${contractId}
        AND approval."revokedAt" IS NULL
        AND protocol.status <> 'DISABLED'
    `);
    const definitionByProtocol = new Map(
      definitions.map((item) => [
        `${item.protocolCode}::${item.protocolVersion}`,
        item.definitionSnapshot,
      ])
    );

    return protocols.map((protocol) => {
      const definition = definitionByProtocol.get(
        `${protocol.code}::${protocol.version}`
      );
      if (!definition) {
        throw new AdipometryServiceError(
          'O protocolo não possui definição clínica aprovada.',
          'PROTOCOL_NOT_APPROVED_FOR_CONTRACT',
          409
        );
      }
      return {
        ...protocol,
        ...buildAdipometryProtocolPresentation(
          definition,
          protocol.compatibility
        ),
      };
    });
  };

  adipometryService.createDraft = async (
    contractId: string,
    alunoId: string,
    actorUserId: string,
    actorProfessorId: string,
    input: CreateAdipometryDraftInput
  ) => {
    if (input.protocolSex) {
      const profile = await getAdipometryProfile(
        adipometryRuntimePrisma,
        contractId,
        alunoId
      );
      assertAdipometryProtocolSexSource(
        profile,
        input.protocolSex,
        input.protocolSexSource,
        input.protocolSexOverrideReason
      );
    }
    return originalCreateDraft(
      contractId,
      alunoId,
      actorUserId,
      actorProfessorId,
      input
    );
  };

  adipometryService.updateDraft = async (
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    input: UpdateAdipometryDraftInput
  ) => {
    if (!hasAdipometryProtocolSexDecisionPatch(input)) {
      return originalUpdateDraft(contractId, assessmentId, actorUserId, input);
    }

    const row = await getAdipometryAssessmentRow(
      adipometryRuntimePrisma,
      contractId,
      assessmentId
    );
    const mergedDecision = mergeAdipometryProtocolSexDecisionPatch(input, {
      protocolSex: row.protocolSex ?? null,
      protocolSexSource: row.protocolSexSource ?? null,
      protocolSexOverrideReason: row.protocolSexOverrideReason ?? null,
    });
    if (!mergedDecision.protocolSex) {
      throw new AdipometryServiceError(
        'Informe o sexo de referência antes de alterar sua origem ou justificativa.',
        'ADIPOMETRY_INVALID_PROTOCOL_SEX_DECISION',
        400
      );
    }

    const protocolSexSource =
      mergedDecision.protocolSexSource ?? 'professional_confirmation';
    const profile = await getAdipometryProfile(
      adipometryRuntimePrisma,
      contractId,
      row.alunoId
    );
    assertAdipometryProtocolSexSource(
      profile,
      mergedDecision.protocolSex,
      protocolSexSource,
      mergedDecision.protocolSexOverrideReason
    );

    return originalUpdateDraft(contractId, assessmentId, actorUserId, {
      ...input,
      protocolSex: mergedDecision.protocolSex,
      protocolSexSource,
      protocolSexOverrideReason: mergedDecision.protocolSexOverrideReason,
      expectedUpdatedAt: input.expectedUpdatedAt ?? row.updatedAt.toISOString(),
    });
  };

  adipometryService.calculate = async (
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    options: { skinfoldCapacityWarningConfirmed?: boolean } = {}
  ) => adipometryRuntimePrisma.$transaction(async (tx) => {
    await setAdipometryActor(tx, actorUserId);
    let row = await getAdipometryAssessmentRow(
      tx,
      contractId,
      assessmentId,
      true
    );
    const initial = await buildHardenedAdipometryPreview(
      tx,
      contractId,
      actorUserId,
      row
    );
    const confirmationReason = initial.compatibility.reasons.find(
      (reason) => reason.code === 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED'
    );
    if (!options.skinfoldCapacityWarningConfirmed || !confirmationReason) {
      return initial;
    }

    const otherBlockingReasons = initial.compatibility.reasons.filter(
      (reason) => reason.code !== 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED'
    );
    if (otherBlockingReasons.length > 0) return initial;

    await tx.adipometryAssessment.update({
      where: { id: assessmentId },
      data: {
        skinfoldCapacityWarningConfirmedByUserId: actorUserId,
        skinfoldCapacityWarningConfirmedAt: new Date(),
      },
    });
    row = await getAdipometryAssessmentRow(tx, contractId, assessmentId, true);
    return buildHardenedAdipometryPreview(tx, contractId, actorUserId, row);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  adipometryService.finalize = async (
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    input: { inputFingerprint: string; expectedUpdatedAt?: string }
  ) => {
    const outcome = await runAdipometrySerializableTransaction(async (tx) => {
      await setAdipometryActor(tx, actorUserId);
      const row = await getAdipometryAssessmentRow(
        tx,
        contractId,
        assessmentId,
        true
      );
      if (row.status === 'COMPLETED' && row.revisionStatus === 'FINALIZED') {
        return { alreadyFinalized: true };
      }
      if (!input?.inputFingerprint) {
        throw new AdipometryServiceError(
          'Calcule a prévia e informe o fingerprint antes de concluir.',
          'ADIPOMETRY_PREVIEW_REQUIRED',
          409
        );
      }
      if (row.status !== 'DRAFT' || row.revisionStatus !== 'DRAFT') {
        throw new AdipometryServiceError(
          'A avaliação não está disponível para conclusão.',
          'ADIPOMETRY_INVALID_STATE',
          409
        );
      }
      if (
        input.expectedUpdatedAt
        && row.updatedAt.toISOString() !== input.expectedUpdatedAt
      ) {
        throw new AdipometryServiceError(
          'O rascunho foi atualizado por outra sessão. Recalcule antes de concluir.',
          'ADIPOMETRY_STALE_DRAFT',
          409
        );
      }

      const preview = await buildHardenedAdipometryPreview(
        tx,
        contractId,
        actorUserId,
        row,
        { lockAuthorities: true }
      );
      if (!preview.canFinalize || !preview.results || !preview.calculationSnapshot) {
        throw new AdipometryServiceError(
          'Corrija as incompatibilidades antes de concluir a avaliação.',
          'ADIPOMETRY_NOT_READY_TO_FINALIZE',
          409
        );
      }
      if (input.inputFingerprint !== preview.inputFingerprint) {
        throw new AdipometryServiceError(
          'As entradas cadastrais ou clínicas mudaram após a prévia. Calcule novamente antes de concluir.',
          'ADIPOMETRY_PREVIEW_INVALIDATED',
          409
        );
      }

      const snapshot = preview.calculationSnapshot as AdipometryCalculationSnapshot;
      const protocol = await getAdipometryApprovedProtocol(
        tx,
        contractId,
        snapshot.protocol.code,
        snapshot.protocol.version,
        true
      );
      await tx.adipometryAssessment.update({
        where: { id: assessmentId },
        data: {
          status: 'COMPLETED',
          revisionStatus: 'FINALIZED',
          protocolId: protocol.protocolId,
          protocolCode: snapshot.protocol.code,
          protocolVersion: snapshot.protocol.version,
          skinfoldTotalMm: preview.results.skinfoldTotalMm,
          bodyFatPercentage: preview.results.bodyFatPercentage,
          fatMassKg: preview.results.fatMassKg,
          leanMassKg: preview.results.leanMassKg,
          calculationSnapshot: snapshot as any,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return { alreadyFinalized: false };
    });

    return {
      assessment: await originalGetAssessment(contractId, assessmentId),
      alreadyFinalized: outcome.alreadyFinalized,
    };
  };
}
