from pathlib import Path
import textwrap


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:80]}")
    write(path, text.replace(old, new, 1))


path = "apps/api/src/modules/capacity-prescriptions/capacity-prescription-source.routes.ts"
replace_once(
    path,
    "import type { CapacityPrescriptionSourceRef } from '@corrida/types';",
    "import type {\n  CapacityAdipometryTechnicalSnapshot,\n  CapacityPrescriptionSourceRef,\n} from '@corrida/types';",
)
replace_once(
    path,
    "import {\n  ADIPOMETRY_FORMULA_VERSION,\n  calculateAdipometryComposition,\n} from './capacity-prescription-formulas.js';",
    "import {\n  ADIPOMETRY_FORMULA_VERSION,\n  ADIPOMETRY_PROTOCOL_MIN_AGE,\n  ADIPOMETRY_PROTOCOL_NAME,\n  AdipometryProtocolError,\n  calculateAdipometryComposition,\n  type AdipometrySex,\n} from './capacity-prescription-formulas.js';",
)

text = read(path)
start = text.index("function derivedAdipometryDetails")
end = text.index("\nfunction requireBlocks")
replacement = textwrap.dedent(
    """
    function parseAdipometrySex(value: string | null | undefined): AdipometrySex | null {
      const normalized = value ? normalizedMetricKey(value) : '';
      if (normalized.startsWith('f')) return 'female';
      if (normalized.startsWith('m')) return 'male';
      return null;
    }

    type AdipometryAlunoContext = {
      ageYears: number | null;
      sex: AdipometrySex | null;
    };

    function unavailableAdipometrySnapshot(
      base: Omit<CapacityAdipometryTechnicalSnapshot, 'status' | 'reason' | 'message' | 'result'>,
      reason: CapacityAdipometryTechnicalSnapshot['reason'],
      message: string,
      status: CapacityAdipometryTechnicalSnapshot['status'] = 'unavailable'
    ): CapacityAdipometryTechnicalSnapshot {
      return { ...base, status, reason, message, result: null };
    }

    function deriveAdipometryTechnicalSnapshot(
      category: string,
      measurements: AssessmentMeasurementRecord[],
      alunoContext: AdipometryAlunoContext
    ): CapacityAdipometryTechnicalSnapshot | null {
      if (!normalizedMetricKey(category).includes('adip')) return null;

      const assessmentSex = parseAdipometrySex(
        measurementText(measurements, ['sex', 'gender', 'sexo', 'genero'])
      );
      const sex = assessmentSex ?? alunoContext.sex;
      const ageYears =
        measurementNumber(measurements, ['age', 'age_years', 'idade', 'idade_anos']) ??
        alunoContext.ageYears;
      const weightKg = measurementNumber(
        measurements,
        ['weight', 'weight_kg', 'peso', 'peso_kg']
      );
      const skinfoldsMm = {
        triceps: measurementNumber(measurements, ['triceps', 'tricipital']),
        subscapular: measurementNumber(measurements, ['subscapular']),
        suprailiac: measurementNumber(measurements, [
          'suprailiac',
          'supra_iliac',
          'suprailiaca',
          'supra_iliaca',
        ]),
        abdominal: measurementNumber(measurements, ['abdominal', 'abdomen']),
        thigh: measurementNumber(measurements, ['thigh', 'coxa']),
      };
      const base = {
        kind: 'adipometry' as const,
        protocolName: ADIPOMETRY_PROTOCOL_NAME,
        protocolVersion: ADIPOMETRY_FORMULA_VERSION,
        applicability: {
          population: 'adult' as const,
          minimumAgeYears: ADIPOMETRY_PROTOCOL_MIN_AGE,
          ageYears,
        },
        input: {
          ageYears,
          sex,
          sexSource: assessmentSex
            ? ('assessment' as const)
            : alunoContext.sex
              ? ('student_profile' as const)
              : ('unavailable' as const),
          weightKg,
          skinfoldsMm,
        },
      };

      if (ageYears === null) {
        return unavailableAdipometrySnapshot(
          base,
          'missing_age',
          'Cálculo não realizado: idade do aluno não está disponível para validar a aplicabilidade do protocolo.'
        );
      }
      if (ageYears < ADIPOMETRY_PROTOCOL_MIN_AGE) {
        return unavailableAdipometrySnapshot(
          base,
          'minor_age_not_applicable',
          `Cálculo não realizado: o protocolo é aplicável somente a adultos a partir de ${ADIPOMETRY_PROTOCOL_MIN_AGE} anos.`,
          'not_applicable'
        );
      }
      if (!sex) {
        return unavailableAdipometrySnapshot(
          base,
          'missing_sex',
          'Cálculo não realizado: sexo não disponível na avaliação nem no perfil do aluno.'
        );
      }
      if (weightKg === null) {
        return unavailableAdipometrySnapshot(
          base,
          'missing_weight',
          'Cálculo não realizado: peso não disponível na avaliação.'
        );
      }
      const required =
        sex === 'female'
          ? [skinfoldsMm.subscapular, skinfoldsMm.suprailiac, skinfoldsMm.thigh]
          : [skinfoldsMm.triceps, skinfoldsMm.suprailiac, skinfoldsMm.abdominal];
      if (required.some((value) => value === null)) {
        return unavailableAdipometrySnapshot(
          base,
          'missing_required_skinfolds',
          `Cálculo não realizado: faltam as três dobras obrigatórias do protocolo para o sexo ${sex === 'female' ? 'feminino' : 'masculino'}.`
        );
      }

      try {
        const result = calculateAdipometryComposition({
          ageYears,
          sex,
          weightKg,
          skinfoldsMm,
        });
        return {
          ...base,
          status: 'calculated',
          reason: null,
          message: 'Cálculo realizado e congelado com a versão da fórmula informada.',
          result: {
            densitySkinfoldSumMm: result.densitySkinfoldSumMm,
            totalSkinfoldsMm: result.totalSkinfoldsMm,
            bodyDensity: result.bodyDensity,
            bodyFatPercentage: result.bodyFatPercentage,
            fatMassKg: result.fatMassKg,
            leanMassKg: result.leanMassKg,
          },
        };
      } catch (error) {
        const message =
          error instanceof AdipometryProtocolError
            ? error.message
            : 'Cálculo não realizado por dados de adipometria inválidos.';
        return unavailableAdipometrySnapshot(base, 'invalid_measurements', message);
      }
    }

    function adipometrySnapshotDetails(snapshot: CapacityAdipometryTechnicalSnapshot | null) {
      if (!snapshot) return [];
      const details = [
        { label: 'Protocolo de adipometria', value: snapshot.protocolName, unit: null },
        { label: 'Status do cálculo', value: snapshot.message, unit: null },
        { label: 'Versão da fórmula', value: snapshot.protocolVersion, unit: null },
      ];
      if (!snapshot.result) return details;
      return [
        { label: 'Total de dobras', value: snapshot.result.totalSkinfoldsMm, unit: 'mm' },
        { label: '% Gordura', value: snapshot.result.bodyFatPercentage, unit: '%' },
        { label: 'Gordura absoluta', value: snapshot.result.fatMassKg, unit: 'kg' },
        { label: 'Massa magra', value: snapshot.result.leanMassKg, unit: 'kg' },
        ...details,
      ];
    }

    async function loadAdipometryAlunoContext(
      contractId: string,
      alunoId: string
    ): Promise<AdipometryAlunoContext> {
      const aluno = await prisma.aluno.findFirst({
        where: { id: alunoId, contractId },
        select: {
          age: true,
          user: { select: { profile: { select: { gender: true } } } },
        },
      });
      return {
        ageYears: aluno?.age ?? null,
        sex: parseAdipometrySex(aluno?.user?.profile?.gender),
      };
    }
    """
).strip()
write(path, text[:start] + replacement + text[end:])

replace_once(
    path,
    "  actorProfessorId: string,\n  source: CapacityPrescriptionSourceRef\n): Promise<CapacityPrescriptionSourceRef> {",
    "  actorProfessorId: string,\n  alunoContext: AdipometryAlunoContext,\n  source: CapacityPrescriptionSourceRef\n): Promise<CapacityPrescriptionSourceRef> {",
)
replace_once(path, "    if (!assessment) return source;", "    if (!assessment) return { ...source, technicalSnapshot: null };")
replace_once(path, "    if (!record) return source;", "    if (!record) return { ...source, technicalSnapshot: null };")
replace_once(
    path,
    "        recordedByUserId: true,\n      },",
    "        recordedByUserId: true,\n        measurements: {\n          orderBy: { sortOrder: 'asc' },\n          select: {\n            metricKey: true,\n            metricLabel: true,\n            valueType: true,\n            valueText: true,\n            valueNumber: true,\n            valueBoolean: true,\n            unit: true,\n          },\n        },\n      },",
)
replace_once(
    path,
    "    return {\n      type: mapAssessmentSourceType(record.assessmentCategory),",
    "    const technicalSnapshot = deriveAdipometryTechnicalSnapshot(\n      record.assessmentCategory,\n      record.measurements,\n      alunoContext\n    );\n    return {\n      type: mapAssessmentSourceType(record.assessmentCategory),",
)
replace_once(
    path,
    "      responsibleProfessorId: await assessmentProfessorId(\n        contractId,\n        record.performedByProfessorId,\n        record.recordedByUserId\n      ),\n    };",
    "      responsibleProfessorId: await assessmentProfessorId(\n        contractId,\n        record.performedByProfessorId,\n        record.recordedByUserId\n      ),\n      technicalSnapshot,\n    };",
)
replace_once(path, "  return source;\n}\n\nrouter.post(", "  return { ...source, technicalSnapshot: null };\n}\n\nrouter.post(")
replace_once(
    path,
    "      body.sourceRefs = await Promise.all(\n        sourceRefs.map((source) =>",
    "      const alunoContext = await loadAdipometryAlunoContext(\n        actor.contractId,\n        req.params.alunoId\n      );\n      body.sourceRefs = await Promise.all(\n        sourceRefs.map((source) =>",
)
replace_once(
    path,
    "            actor.professorId,\n            source",
    "            actor.professorId,\n            alunoContext,\n            source",
)
replace_once(
    path,
    "        select: { id: true },",
    "        select: {\n          id: true,\n          age: true,\n          user: { select: { profile: { select: { gender: true } } } },\n        },",
)

old_map = textwrap.dedent(
    """
          const segmentedSources = records.map((record) => ({
            ref: {
              type: mapAssessmentSourceType(record.assessmentCategory),
              id: record.id,
              label: record.title || `Avaliação ${record.assessmentCategory}`,
              assessedAt: record.performedAt.toISOString(),
              origin: record.sourceReference || record.sourceType,
              version: record.updatedAt.toISOString(),
              responsibleProfessorId:
                record.performedByProfessorId ||
                (record.recordedByUserId ? professorByUserId.get(record.recordedByUserId) : null) ||
                null,
            } satisfies CapacityPrescriptionSourceRef,
            category: record.assessmentCategory,
            status: record.status,
            details: [
              ...record.measurements.map((measurement) => ({
                label: measurement.metricLabel || measurement.metricKey,
                value:
                  measurement.valueType === 'number'
                    ? decimalToNumber(measurement.valueNumber)
                    : measurement.valueType === 'boolean'
                      ? measurement.valueBoolean
                      : measurement.valueText,
                unit: measurement.unit,
              })),
              ...derivedAdipometryDetails(record.assessmentCategory, record.measurements),
            ],
          }));
    """
)
new_map = textwrap.dedent(
    """
          const alunoContext: AdipometryAlunoContext = {
            ageYears: aluno.age ?? null,
            sex: parseAdipometrySex(aluno.user?.profile?.gender),
          };
          const segmentedSources = records.map((record) => {
            const technicalSnapshot = deriveAdipometryTechnicalSnapshot(
              record.assessmentCategory,
              record.measurements,
              alunoContext
            );
            return {
              ref: {
                type: mapAssessmentSourceType(record.assessmentCategory),
                id: record.id,
                label: record.title || `Avaliação ${record.assessmentCategory}`,
                assessedAt: record.performedAt.toISOString(),
                origin: record.sourceReference || record.sourceType,
                version: record.updatedAt.toISOString(),
                responsibleProfessorId:
                  record.performedByProfessorId ||
                  (record.recordedByUserId ? professorByUserId.get(record.recordedByUserId) : null) ||
                  null,
                technicalSnapshot,
              } satisfies CapacityPrescriptionSourceRef,
              category: record.assessmentCategory,
              status: record.status,
              details: [
                ...record.measurements.map((measurement) => ({
                  label: measurement.metricLabel || measurement.metricKey,
                  value:
                    measurement.valueType === 'number'
                      ? decimalToNumber(measurement.valueNumber)
                      : measurement.valueType === 'boolean'
                        ? measurement.valueBoolean
                        : measurement.valueText,
                  unit: measurement.unit,
                })),
                ...adipometrySnapshotDetails(technicalSnapshot),
              ],
            };
          });
    """
)
replace_once(path, old_map, new_map)

print("source remediation applied")
