from pathlib import Path
import textwrap


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}")
    write(path, text.replace(old, new, 1))


path = "packages/types/capacity-prescription.ts"
replace_once(
    path,
    "export interface CapacityPrescriptionSourceRef {\n",
    textwrap.dedent(
        """
        export type CapacityAdipometrySnapshotStatus =
          | 'calculated'
          | 'unavailable'
          | 'not_applicable';

        export type CapacityAdipometrySnapshotReason =
          | 'missing_age'
          | 'minor_age_not_applicable'
          | 'missing_sex'
          | 'missing_weight'
          | 'missing_required_skinfolds'
          | 'invalid_measurements';

        export interface CapacityAdipometryTechnicalSnapshot {
          kind: 'adipometry';
          protocolName: string;
          protocolVersion: string;
          status: CapacityAdipometrySnapshotStatus;
          reason?: CapacityAdipometrySnapshotReason | null;
          message: string;
          applicability: {
            population: 'adult';
            minimumAgeYears: number;
            ageYears: number | null;
          };
          input: {
            ageYears: number | null;
            sex: 'male' | 'female' | null;
            sexSource: 'assessment' | 'student_profile' | 'unavailable';
            weightKg: number | null;
            skinfoldsMm: {
              triceps: number | null;
              subscapular: number | null;
              suprailiac: number | null;
              abdominal: number | null;
              thigh: number | null;
            };
          };
          result?: {
            densitySkinfoldSumMm: number;
            totalSkinfoldsMm: number;
            bodyDensity: number;
            bodyFatPercentage: number;
            fatMassKg: number;
            leanMassKg: number;
          } | null;
        }

        export type CapacityPrescriptionTechnicalSnapshot =
          CapacityAdipometryTechnicalSnapshot;

        export interface CapacityPrescriptionSourceRef {
        """
    ).lstrip(),
)
replace_once(
    path,
    "  responsibleProfessorId?: string | null;\n}\n\nexport interface CapacityPrescriptionAlert",
    "  responsibleProfessorId?: string | null;\n  technicalSnapshot?: CapacityPrescriptionTechnicalSnapshot | null;\n}\n\nexport interface CapacityPrescriptionAlert",
)

write(
    "apps/api/src/modules/capacity-prescriptions/capacity-prescription-formulas.ts",
    textwrap.dedent(
        """
        export const ADIPOMETRY_FORMULA_VERSION = 'guedes-three-fold-siri-v1';
        export const ADIPOMETRY_PROTOCOL_NAME = 'Guedes (três dobras) + Siri';
        export const ADIPOMETRY_PROTOCOL_MIN_AGE = 18;

        export type AdipometrySex = 'male' | 'female';
        export type AdipometryProtocolErrorCode = 'INVALID_INPUT' | 'NOT_APPLICABLE';

        export class AdipometryProtocolError extends Error {
          constructor(
            public readonly code: AdipometryProtocolErrorCode,
            message: string
          ) {
            super(message);
            this.name = 'AdipometryProtocolError';
          }
        }

        export interface AdipometrySkinfoldsMm {
          triceps?: number | null;
          subscapular?: number | null;
          suprailiac?: number | null;
          abdominal?: number | null;
          thigh?: number | null;
        }

        export interface AdipometryCompositionInput {
          ageYears: number;
          sex: AdipometrySex;
          weightKg: number;
          skinfoldsMm: AdipometrySkinfoldsMm;
        }

        export interface AdipometryCompositionResult {
          formulaVersion: typeof ADIPOMETRY_FORMULA_VERSION;
          densitySkinfoldSumMm: number;
          totalSkinfoldsMm: number;
          bodyDensity: number;
          bodyFatPercentage: number;
          fatMassKg: number;
          leanMassKg: number;
        }

        function invalid(message: string): never {
          throw new AdipometryProtocolError('INVALID_INPUT', message);
        }

        function assertPositiveFinite(value: number | null | undefined, field: string): number {
          if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
            invalid(`${field} deve ser maior que zero`);
          }
          return value;
        }

        export function assertAdipometryProtocolApplicability(ageYears: number): number {
          if (!Number.isInteger(ageYears) || ageYears <= 0 || ageYears > 120) {
            invalid('Idade deve ser um número inteiro válido');
          }
          if (ageYears < ADIPOMETRY_PROTOCOL_MIN_AGE) {
            throw new AdipometryProtocolError(
              'NOT_APPLICABLE',
              `O protocolo ${ADIPOMETRY_PROTOCOL_NAME} é aplicável somente a adultos a partir de ${ADIPOMETRY_PROTOCOL_MIN_AGE} anos`
            );
          }
          return ageYears;
        }

        function sumProvidedSkinfolds(skinfolds: AdipometrySkinfoldsMm) {
          const provided = Object.values(skinfolds).filter(
            (value): value is number => value !== null && value !== undefined
          );
          if (provided.length < 3) invalid('Ao menos três dobras cutâneas devem ser informadas');
          return provided.reduce(
            (total, value) => total + assertPositiveFinite(value, 'Dobra cutânea'),
            0
          );
        }

        /**
         * Reproduz a regra identificada como Guedes na planilha
         * `Modelo Avaliação Física v.4.10.12`, aba `Avaliação`:
         * feminino usa Subescapular + Suprailíaca + Coxa; masculino usa
         * Tricipital + Suprailíaca + Abdominal; a conversão final usa Siri.
         */
        export function calculateAdipometryComposition(
          input: AdipometryCompositionInput
        ): AdipometryCompositionResult {
          assertAdipometryProtocolApplicability(input.ageYears);
          const weightKg = assertPositiveFinite(input.weightKg, 'Peso');
          const totalSkinfoldsMm = sumProvidedSkinfolds(input.skinfoldsMm);
          const densitySkinfoldSumMm =
            input.sex === 'female'
              ? assertPositiveFinite(input.skinfoldsMm.subscapular, 'Dobra subescapular') +
                assertPositiveFinite(input.skinfoldsMm.suprailiac, 'Dobra suprailíaca') +
                assertPositiveFinite(input.skinfoldsMm.thigh, 'Dobra da coxa')
              : assertPositiveFinite(input.skinfoldsMm.triceps, 'Dobra tricipital') +
                assertPositiveFinite(input.skinfoldsMm.suprailiac, 'Dobra suprailíaca') +
                assertPositiveFinite(input.skinfoldsMm.abdominal, 'Dobra abdominal');
          const bodyDensity =
            input.sex === 'female'
              ? 1.1665 - 0.07063 * Math.log10(densitySkinfoldSumMm)
              : 1.17136 - 0.06706 * Math.log10(densitySkinfoldSumMm);
          if (!Number.isFinite(bodyDensity) || bodyDensity <= 0) {
            invalid('Densidade corporal calculada é inválida');
          }
          const bodyFatPercentage = (4.95 / bodyDensity - 4.5) * 100;
          const fatMassKg = (bodyFatPercentage * weightKg) / 100;
          return {
            formulaVersion: ADIPOMETRY_FORMULA_VERSION,
            densitySkinfoldSumMm,
            totalSkinfoldsMm,
            bodyDensity,
            bodyFatPercentage,
            fatMassKg,
            leanMassKg: weightKg - fatMassKg,
          };
        }
        """
    ).lstrip(),
)

write(
    "apps/api/src/modules/capacity-prescriptions/capacity-prescription-formulas.test.ts",
    textwrap.dedent(
        """
        import {
          ADIPOMETRY_FORMULA_VERSION,
          ADIPOMETRY_PROTOCOL_NAME,
          AdipometryProtocolError,
          calculateAdipometryComposition,
        } from './capacity-prescription-formulas.js';

        describe('capacity prescription formulas', () => {
          it('reproduz a composição masculina de Guedes + Siri com versão explícita', () => {
            const result = calculateAdipometryComposition({
              ageYears: 30,
              sex: 'male',
              weightKg: 80,
              skinfoldsMm: {
                triceps: 10,
                subscapular: 15,
                suprailiac: 20,
                abdominal: 25,
                thigh: 30,
              },
            });
            const expectedDensity = 1.17136 - 0.06706 * Math.log10(55);
            const expectedBodyFat = (4.95 / expectedDensity - 4.5) * 100;
            expect(ADIPOMETRY_FORMULA_VERSION).toBe('guedes-three-fold-siri-v1');
            expect(ADIPOMETRY_PROTOCOL_NAME).toBe('Guedes (três dobras) + Siri');
            expect(result.formulaVersion).toBe(ADIPOMETRY_FORMULA_VERSION);
            expect(result.densitySkinfoldSumMm).toBe(55);
            expect(result.totalSkinfoldsMm).toBe(100);
            expect(result.bodyDensity).toBeCloseTo(expectedDensity, 10);
            expect(result.bodyFatPercentage).toBeCloseTo(expectedBodyFat, 10);
          });

          it('usa as três dobras femininas definidas pela planilha', () => {
            const result = calculateAdipometryComposition({
              ageYears: 25,
              sex: 'female',
              weightKg: 60,
              skinfoldsMm: {
                triceps: 8,
                subscapular: 12,
                suprailiac: 18,
                abdominal: 20,
                thigh: 22,
              },
            });
            const expectedDensity = 1.1665 - 0.07063 * Math.log10(52);
            expect(result.densitySkinfoldSumMm).toBe(52);
            expect(result.bodyDensity).toBeCloseTo(expectedDensity, 10);
          });

          it('rejeita menores com erro de aplicabilidade discriminável', () => {
            try {
              calculateAdipometryComposition({
                ageYears: 17,
                sex: 'male',
                weightKg: 70,
                skinfoldsMm: { triceps: 10, suprailiac: 10, abdominal: 10 },
              });
              throw new Error('esperava erro');
            } catch (error) {
              expect(error).toBeInstanceOf(AdipometryProtocolError);
              expect(error).toMatchObject({ code: 'NOT_APPLICABLE' });
            }
          });

          it('rejeita idade, peso e dobras inválidas', () => {
            expect(() =>
              calculateAdipometryComposition({
                ageYears: 0,
                sex: 'male',
                weightKg: 80,
                skinfoldsMm: { triceps: 10, suprailiac: 10, abdominal: 10 },
              })
            ).toThrow('Idade deve ser um número inteiro válido');
            expect(() =>
              calculateAdipometryComposition({
                ageYears: 30,
                sex: 'male',
                weightKg: 0,
                skinfoldsMm: { triceps: 10, suprailiac: 10, abdominal: 10 },
              })
            ).toThrow('Peso deve ser maior que zero');
            expect(() =>
              calculateAdipometryComposition({
                ageYears: 30,
                sex: 'female',
                weightKg: 60,
                skinfoldsMm: { subscapular: 10, suprailiac: 10 },
              })
            ).toThrow('Ao menos três dobras cutâneas devem ser informadas');
          });
        });
        """
    ).lstrip(),
)

replace_once(
    "apps/api/prisma/schema.prisma",
    "  responsibleProfessorId   String?\n  createdAt                DateTime @default(now())",
    "  responsibleProfessorId   String?\n  technicalSnapshot        Json?\n  createdAt                DateTime @default(now())",
)
write(
    "apps/api/prisma/migrations/20260728192500_capacity_adipometry_technical_snapshot/migration.sql",
    'ALTER TABLE "CapacityPrescriptionSource"\nADD COLUMN "technicalSnapshot" JSONB;\n',
)
replace_once(
    "apps/api/src/modules/capacity-prescriptions/capacity-prescription.service.ts",
    "                responsibleProfessorId: source.responsibleProfessorId,\n              })),",
    "                responsibleProfessorId: source.responsibleProfessorId,\n                ...(source.technicalSnapshot\n                  ? { technicalSnapshot: source.technicalSnapshot as unknown as Prisma.InputJsonValue }\n                  : {}),\n              })),",
)
replace_once(
    "apps/api/src/modules/capacity-prescriptions/capacity-prescription-public.ts",
    "      responsibleProfessorId: source.responsibleProfessorId ?? null,\n    })),",
    "      responsibleProfessorId: source.responsibleProfessorId ?? null,\n      technicalSnapshot: source.technicalSnapshot ?? null,\n    })),",
)

print("core remediation applied")
