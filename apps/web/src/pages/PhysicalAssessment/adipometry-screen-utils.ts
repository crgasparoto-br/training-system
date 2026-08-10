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
  error?: string | { message?: string; details?: { code?: string } };
  details?: { code?: string };
}

export function readAdipometryApiError(error: unknown): {
  message: string;
  status?: number;
  code?: string;
} {
  const candidate = error as {
    message?: string;
    response?: { status?: number; data?: ErrorPayload };
  };
  const data = candidate.response?.data;
  const errorField = data?.error;
  const nestedError = typeof errorField === 'object' ? errorField : undefined;
  return {
    message:
      nestedError?.message
      ?? (typeof errorField === 'string' ? errorField : undefined)
      ?? data?.message
      ?? candidate.message
      ?? 'Não foi possível concluir a operação.',
    status: candidate.response?.status,
    code: nestedError?.details?.code ?? data?.details?.code,
  };
}

export function adipometryFormFromAssessment(
  assessment: AdipometryAssessmentDetail
): AdipometryFormState {
  const measurementScale =
    assessment.calculationSnapshot?.protocolApproval.protocolDefinitionSnapshot
      .precision.measurementScale;
  return {
    assessmentDate: assessment.assessmentDate,
    protocolKey:
      assessment.protocolCode && assessment.protocolVersion
        ? `${assessment.protocolCode}::${assessment.protocolVersion}`
        : '',
    protocolSex: assessment.protocolSex ?? '',
    protocolSexSource: assessment.protocolSexSource ?? '',
    protocolSexOverrideReason: assessment.protocolSexOverrideReason ?? '',
    anthropometryAssessmentId:
      assessment.anthropometryReference?.anthropometryAssessmentId ?? '',
    notes: assessment.notes ?? '',
    measurements: {
      weightKg: formatAdipometryInput(
        assessment.measurements.weightKg,
        measurementScale
      ),
      tricepsMm: formatAdipometryInput(
        assessment.measurements.tricepsMm,
        measurementScale
      ),
      subscapularMm: formatAdipometryInput(
        assessment.measurements.subscapularMm,
        measurementScale
      ),
      suprailiacMm: formatAdipometryInput(
        assessment.measurements.suprailiacMm,
        measurementScale
      ),
      abdominalMm: formatAdipometryInput(
        assessment.measurements.abdominalMm,
        measurementScale
      ),
      thighMm: formatAdipometryInput(
        assessment.measurements.thighMm,
        measurementScale
      ),
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
    return {
      fieldErrors,
      message: 'Revise os campos destacados antes de salvar.',
    };
  }
  if (form.protocolSex && !form.protocolSexSource) {
    return {
      fieldErrors,
      message: 'Informe a origem da decisão do sexo de referência.',
    };
  }
  if (
    form.protocolSexSource === 'professional_override'
    && form.protocolSexOverrideReason.trim().length < 5
  ) {
    return {
      fieldErrors,
      message:
        'Explique a divergência do sexo de referência com pelo menos 5 caracteres.',
    };
  }

  const measurements: Partial<Record<AdipometryInputField, number | null>> = {
    ...built.measurements,
  };
  if (current) {
    for (const input of ADIPOMETRY_INPUTS) {
      if (
        current.measurements[input.field] !== undefined
        && !form.measurements[input.field].trim()
      ) {
        measurements[input.field] = null;
      }
    }
  }

  const protocol = parseAdipometryProtocolKey(form.protocolKey);
  const protocolChanged = Boolean(
    current?.protocolCode
      && protocol
      && (
        current.protocolCode !== protocol.protocolCode
        || current.protocolVersion !== protocol.protocolVersion
      )
  );
  return {
    fieldErrors,
    payload: {
      assessmentDate: form.assessmentDate,
      measurements,
      ...(form.protocolSex ? { protocolSex: form.protocolSex } : {}),
      ...(form.protocolSexSource
        ? {
            protocolSexSource:
              form.protocolSexSource as AdipometryProtocolSexSource,
          }
        : {}),
      protocolSexOverrideReason:
        form.protocolSexOverrideReason.trim() || null,
      ...(protocol ?? {}),
      anthropometryAssessmentId: form.anthropometryAssessmentId || null,
      notes: form.notes.trim() || null,
      expectedUpdatedAt: current?.updatedAt,
      ...(isCorrectionDraft
        && current?.correctionCategory === 'PROTOCOL_SELECTION_ERROR'
        && protocolChanged
        ? { confirmProtocolChange: true }
        : {}),
    },
  };
}
