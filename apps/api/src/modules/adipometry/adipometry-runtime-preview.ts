import type { AdipometryProtocolDefinitionSnapshot, AdipometryProtocolSex, AdipometryProtocolSexSource, AdipometrySkinfoldField } from '@corrida/types';
import { AdipometryServiceError, buildAdipometryInputFingerprint, calculateAdipometry, normalizeAdipometryDateOnly, type AdipometryCalculationContext, type AdipometryPreviewResult } from './adipometry.service.js';
import { applyPersistedProtocolSexDecision, buildAdipometryClinicalFingerprint, getProtocolSexSourceIncompatibility, type AdipometryProfileAuthority } from './adipometry-clinical-integrity.js';
import { adipometryMeasurementsFromRow, getAdipometryAnthropometrySupport, getAdipometryApprovedProtocol, getAdipometryProfile, getPersistedAdipometryDecision, type AdipometryAssessmentRow, type AdipometryApprovedProtocolRow, type AdipometryDbClient } from './adipometry-runtime-db.js';
import { assertAdipometryResponsibleProfessorAvailable } from './adipometry-responsible-lifecycle-guard.js';

function addDecisionIncompatibility(compatibility: AdipometryPreviewResult['compatibility'], reason: AdipometryPreviewResult['compatibility']['reasons'][number] | null) {
  if (!reason || compatibility.reasons.some((item) => item.code === reason.code && item.field === reason.field)) return compatibility;
  return { ...compatibility, compatible: false, reasons: [...compatibility.reasons, reason] };
}

export async function buildHardenedAdipometryPreview(client: AdipometryDbClient, contractId: string, actorUserId: string, row: AdipometryAssessmentRow, options: { lockAuthorities?: boolean } = {}): Promise<AdipometryPreviewResult> {
  if (row.revisionStatus !== 'DRAFT' || row.status !== 'DRAFT') throw new AdipometryServiceError('Somente um rascunho pode ser calculado.', 'ADIPOMETRY_INVALID_STATE', 409);
  await assertAdipometryResponsibleProfessorAvailable(
    client,
    contractId,
    row.professorId
  );
  if (!row.protocolCode || !row.protocolVersion) throw new AdipometryServiceError('Selecione um protocolo antes de calcular.', 'ADIPOMETRY_PROTOCOL_REQUIRED');

  const assessmentDate = normalizeAdipometryDateOnly(row.assessmentDate);
  let profile: AdipometryProfileAuthority;
  let protocol: AdipometryApprovedProtocolRow;
  let anthropometrySupport: Awaited<ReturnType<typeof getAdipometryAnthropometrySupport>>;
  if (options.lockAuthorities) {
    protocol = await getAdipometryApprovedProtocol(client, contractId, row.protocolCode, row.protocolVersion, true);
    profile = await getAdipometryProfile(client, contractId, row.alunoId, true);
    anthropometrySupport = await getAdipometryAnthropometrySupport(client, contractId, row.alunoId, assessmentDate, row.anthropometryAssessmentId);
  } else {
    [profile, protocol, anthropometrySupport] = await Promise.all([
      getAdipometryProfile(client, contractId, row.alunoId),
      getAdipometryApprovedProtocol(client, contractId, row.protocolCode, row.protocolVersion),
      getAdipometryAnthropometrySupport(client, contractId, row.alunoId, assessmentDate, row.anthropometryAssessmentId),
    ]);
  }

  const capacityWarningConfirmed = Boolean(row.skinfoldCapacityWarningConfirmedAt);
  const calculationContext: AdipometryCalculationContext = {
    assessmentId: row.id,
    alunoId: row.alunoId,
    assessmentDate,
    measurements: adipometryMeasurementsFromRow(row),
    protocolSex: row.protocolSex,
    protocolSexSource: row.protocolSexSource,
    protocolSexOverrideReason: row.protocolSexOverrideReason,
    profile,
    protocol,
    capacityWarningConfirmed,
    actorUserId,
  };
  const calculated = calculateAdipometry(calculationContext);
  const decision = getPersistedAdipometryDecision(row);
  const decisionReason = getProtocolSexSourceIncompatibility({ profile, protocolSex: decision.protocolSex, source: decision.source, overrideReason: decision.overrideReason, requirePersistedConfirmation: true, confirmedByUserId: decision.confirmedByUserId, confirmedAt: decision.confirmedAt });
  const compatibility = addDecisionIncompatibility(calculated.compatibility, decisionReason);
  const calculationSnapshot = calculated.calculationSnapshot && compatibility.compatible ? applyPersistedProtocolSexDecision(calculated.calculationSnapshot, decision) : undefined;
  const definition = protocol.definitionSnapshot as AdipometryProtocolDefinitionSnapshot;
  const sexKey = calculationContext.protocolSex === 'female' ? 'FEMALE' : 'MALE';
  const usedSkinfolds: AdipometrySkinfoldField[] = calculationContext.protocolSex ? [...(definition.calculationSkinfoldsBySex?.[sexKey] ?? [])] : [];
  const legacyFingerprint = buildAdipometryInputFingerprint({ assessmentId: row.id, assessmentDate, measurements: calculationContext.measurements, protocolSex: calculationContext.protocolSex, protocolSexSource: calculationContext.protocolSexSource, protocolSexOverrideReason: calculationContext.protocolSexOverrideReason, protocolCode: protocol.protocolCode, protocolVersion: protocol.protocolVersion, approvalId: protocol.approvalId, capacityWarningConfirmed });
  const inputFingerprint = buildAdipometryClinicalFingerprint({ legacyFingerprint, profile, ageAtAssessment: calculationSnapshot?.ageAtAssessment ?? null, decision });

  return {
    protocol: { code: protocol.protocolCode, name: protocol.protocolName, version: protocol.protocolVersion, status: 'APPROVED', compatibility },
    normalizedMeasurements: calculationContext.measurements,
    usedSkinfolds,
    compatibility,
    ...(compatibility.compatible && calculated.results ? { results: calculated.results } : {}),
    ...(calculationSnapshot ? { calculationSnapshot } : {}),
    inputFingerprint,
    canFinalize: compatibility.compatible,
    anthropometrySupport,
  };
}

export function assertAdipometryProtocolSexSource(profile: AdipometryProfileAuthority, protocolSex: AdipometryProtocolSex, source: AdipometryProtocolSexSource | undefined, overrideReason: string | null | undefined) {
  const reason = getProtocolSexSourceIncompatibility({ profile, protocolSex, source: source ?? 'professional_confirmation', overrideReason: overrideReason ?? null });
  if (reason) throw new AdipometryServiceError(reason.message, reason.code, 400);
}
