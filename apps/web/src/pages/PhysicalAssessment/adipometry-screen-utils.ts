import type {
  AdipometryAssessmentDetail,
  AdipometryInputField,
  AdipometryProtocolSexSource,
  UpdateAdipometryDraftWithClearInput,
} from '@corrida/types';
import {
  ADIPOMETRY_INPUTS,
  buildAdipometryMeasurements,
  formatAdipometryInput,
  type AdipometryFormState,
} from './adipometry-ui';

interface ErrorPayload {
  message?: string;
  error?: { message?: string; details?: { code?: string } };
  details?: { code?: string };
}

export function readAdipometryApiError(error: unknown): { message: string; status?: number; code?: string } {
  const candidate = error as {
    message?: string;
    response?: { status?: number; data?: ErrorPayload };
  };
  const data = candidate.response?.data;
  return {
    message: data?.error?.message ?? data?.message ?? candidate.message ?? 'Não foi possível concluir a operação.',
    status: candidate.response?.status,
    code: data?.error?.details?.code ?? data?.details?.code,
  };
}

export function adipometryFormFromAssessment(assessment: AdipometryAssessmentDetail): AdipometryFormState {
  return {
    assessmentDate: assessment.assessmentDate,
    protocolKey: assessment.protocolCode && assessment.protocolVersion
      ? `${assessment.protocolCode}::${assessment.protocolVersion}`
      : '',
    protocolSex: assessment.protocolSex ?? '',
    protocolSexSource: assessment.protocolSexSource ?? '',
    protocolSexOverrideReason: assessment.protocolSexOverrideReason ?? '',
    anthropometryAssessmentId: assessment.anthropometryReference?.anthropometryAssessmentId ?? '',
    notes: assessment.notes ?? '',
    measurements: {
      weightKg: formatAdipometryInput(assessment.measurements.weightKg),
      tricepsMm: formatAdipometryInput(assessment.measurements.tricepsMm),
      subscapularMm: formatAdipometryInput(assessment.measurements.subscapularMm),
      suprailiacMm: formatAdipometryInput(assessment.measurements.suprailiacMm),
      abdominalMm: formatAdipometryInput(assessment.measurements.abdominalMm),
      thighMm: formatAdipometryInput(assessment.measurements.thighMm),
    },
  };
}

export function parseAdipometryProtocolKey(value: string) {
  if (!value) return null;
  const [code, version] = value.split('::');
  const parsedVersion = Number(version);
  return code && Number.isInteger(parsedVersion) && parsedVersion > 0
    ? { protocolCode: code, protocolVersion: parsedVersion }
    : null;
}

export function buildAdipometryDraftPayload({
  form,
  current,
  isCorrectionDraft,
}: {
  form: AdipometryFormState;
  current: AdipometryAssessmentDetail | null;
  isCorrectionDraft: boolean;
}): {
  payload?: UpdateAdipometryDraftWithClearInput;
  fieldErrors: Partial<Record<AdipometryInputField, string>>;
  message?: string;
} {
  const built = buildAdipometryMeasurements(form.measurements);
  const fieldErrors = { ...built.errors };
  if (Object.keys(fieldErrors).length) {
    return { fieldErrors, message: 'Revise os campos destacados antes de salvar.' };
  }
  if (form.protocolSex && !form.protocolSexSource) {
    return { fieldErrors, message: 'Informe a origem da decisão do sexo de referência.' };
  }
  if (form.protocolSexSource === 'professional_override' && form.protocolSexOverrideReason.trim().length < 5) {
    return { fieldErrors, message: 'Explique a divergência do sexo de referência com pelo menos 5 caracteres.' };
  }

  const measurements: Partial<Record<AdipometryInputField, number | null>> = {
    ...built.measurements,
  };
  if (current) {
    for (const input of ADIPOMETRY_INPUTS) {
      if (current.measurements[input.field] !== undefined && !form.measurements[input.field].trim()) {
        measurements[input.field] = null;
      }
    }
  }

  const protocol = parseAdipometryProtocolKey(form.protocolKey);
  const protocolChanged = Boolean(
    current?.protocolCode && protocol &&
    (current.protocolCode !== protocol.protocolCode || current.protocolVersion !== protocol.protocolVersion)
  );
  return {
    fieldErrors,
    payload: {
      assessmentDate: form.assessmentDate,
      measurements,
      ...(form.protocolSex ? { protocolSex: form.protocolSex } : {}),
      ...(form.protocolSexSource ? { protocolSexSource: form.protocolSexSource as AdipometryProtocolSexSource } : {}),
      protocolSexOverrideReason: form.protocolSexOverrideReason.trim() || null,
      ...(protocol ?? {}),
      anthropometryAssessmentId: form.anthropometryAssessmentId || null,
      notes: form.notes.trim() || null,
      expectedUpdatedAt: current?.updatedAt,
      ...(isCorrectionDraft && current?.correctionCategory === 'PROTOCOL_SELECTION_ERROR' && protocolChanged
        ? { confirmProtocolChange: true }
        : {}),
    },
  };
}
