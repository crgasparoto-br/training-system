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
        raise RuntimeError(f"{path}: expected one match, found {count}")
    write(path, text.replace(old, new, 1))


path = "apps/api/tests/capacity-prescription-remediation.integration.test.ts"
replace_once(
    path,
    "        status: StudentLifecycleStatus.ACTIVE_STUDENT,\n        maxHeartRate: 190,",
    "        status: StudentLifecycleStatus.ACTIVE_STUDENT,\n        age: 25,\n        maxHeartRate: 190,",
)
replace_once(
    path,
    "value: 'pollock-wilmore-1993-three-fold-siri-v1',",
    "value: 'guedes-three-fold-siri-v1',",
)
replace_once(
    path,
    "            responsibleProfessorId: professorId,\n          }),\n          details: expect.arrayContaining([\n            expect.objectContaining({ label: '% Gordura', unit: '%' }),",
    "            responsibleProfessorId: professorId,\n            technicalSnapshot: expect.objectContaining({\n              kind: 'adipometry',\n              protocolName: 'Guedes (três dobras) + Siri',\n              protocolVersion: 'guedes-three-fold-siri-v1',\n              status: 'calculated',\n              reason: null,\n              result: expect.objectContaining({\n                totalSkinfoldsMm: 100,\n                densitySkinfoldSumMm: 55,\n              }),\n            }),\n          }),\n          details: expect.arrayContaining([\n            expect.objectContaining({ label: '% Gordura', unit: '%' }),",
)

insert_tests = textwrap.dedent(
    """

      it('persiste snapshot canônico e imutável da adipometria na versão da prescrição', async () => {
        const response = await request(app)
          .post(`/capacity-prescriptions/alunos/${alunoId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            capacity: 'resisted',
            parameterSetIds: [],
            sourceRefs: [
              {
                type: 'adipometry',
                id: adipometryId,
                label: 'Adipometria forjada',
                technicalSnapshot: {
                  kind: 'adipometry',
                  protocolName: 'Protocolo forjado',
                  protocolVersion: 'forjada-v999',
                  status: 'calculated',
                  message: 'forjada',
                  applicability: { population: 'adult', minimumAgeYears: 1, ageYears: 99 },
                  input: {
                    ageYears: 99,
                    sex: 'male',
                    sexSource: 'assessment',
                    weightKg: 999,
                    skinfoldsMm: {
                      triceps: 999,
                      subscapular: 999,
                      suprailiac: 999,
                      abdominal: 999,
                      thigh: 999,
                    },
                  },
                  result: {
                    densitySkinfoldSumMm: 999,
                    totalSkinfoldsMm: 999,
                    bodyDensity: 999,
                    bodyFatPercentage: 999,
                    fatMassKg: 999,
                    leanMassKg: 999,
                  },
                },
              },
            ],
            technicalJustification: 'Usar a adipometria como dado-base rastreável.',
            professorSummary: 'Composição corporal revisada pelo professor.',
            parameters: {
              type: 'resisted',
              resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
            },
          });

        expect(response.status).toBe(201);
        const savedSnapshot = response.body.data.latestVersion.sourceRefs[0].technicalSnapshot;
        expect(savedSnapshot).toMatchObject({
          kind: 'adipometry',
          protocolName: 'Guedes (três dobras) + Siri',
          protocolVersion: 'guedes-three-fold-siri-v1',
          status: 'calculated',
          applicability: { population: 'adult', minimumAgeYears: 18, ageYears: 25 },
          input: { sex: 'male', weightKg: 80 },
          result: { totalSkinfoldsMm: 100, densitySkinfoldSumMm: 55 },
        });
        expect(savedSnapshot.result.bodyFatPercentage).not.toBe(999);

        await prisma.studentAssessmentMeasurement.updateMany({
          where: { assessmentRecordId: adipometryId, metricKey: 'tricipital' },
          data: { valueNumber: 40 },
        });

        const history = await request(app)
          .get(`/capacity-prescriptions/${response.body.data.id}/versions`)
          .set('Authorization', `Bearer ${token}`);
        expect(history.status).toBe(200);
        expect(history.body.data[0].sourceRefs[0].technicalSnapshot).toEqual(savedSnapshot);

        const persisted = await prisma.capacityPrescriptionSource.findFirst({
          where: { versionId: response.body.data.latestVersion.id, sourceId: adipometryId },
        });
        expect(persisted?.technicalSnapshot).toEqual(savedSnapshot);
      });

      it('expõe motivo explícito quando a idade necessária não está disponível', async () => {
        await prisma.aluno.update({ where: { id: alunoId }, data: { age: null } });
        const response = await request(app)
          .get(`/capacity-prescriptions/alunos/${alunoId}/assessment-sources`)
          .set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(200);
        const adipometry = response.body.data.find(
          (source: { ref: { id: string } }) => source.ref.id === adipometryId
        );
        expect(adipometry.ref.technicalSnapshot).toMatchObject({
          status: 'unavailable',
          reason: 'missing_age',
          result: null,
        });
        expect(adipometry.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              label: 'Status do cálculo',
              value: expect.stringContaining('idade do aluno não está disponível'),
            }),
          ])
        );
      });
    """
)
text = read(path)
if not text.endswith("});\n"):
    raise RuntimeError("unexpected integration test ending")
write(path, text[:-4] + insert_tests + "\n});\n")

replace_once(
    "docs/product/capacity-prescription-model.md",
    "Versão: `pollock-wilmore-1993-three-fold-siri-v1`.",
    "Versão: `guedes-three-fold-siri-v1`. A metodologia é identificada como **Guedes (três dobras) + Siri**, de acordo com os coeficientes e as dobras usados pela planilha.",
)
replace_once(
    "docs/product/capacity-prescription-model.md",
    "O serviço valida peso e dobras positivas, exige ao menos três dobras e retorna a versão da fórmula junto dos resultados. Testes usam valores deliberadamente diferentes para os protocolos masculino e feminino.",
    "O serviço valida idade adulta (18 anos ou mais), peso e dobras positivas, exige as três dobras específicas do sexo e retorna a versão da fórmula junto dos resultados. Idade ausente, menoridade, sexo ausente, peso ausente e dobras insuficientes produzem status e motivo explícitos; não são convertidos silenciosamente em ausência de dados. Testes usam valores deliberadamente diferentes para os protocolos masculino e feminino.\n\nAo selecionar uma adipometria como origem, o backend reconstrói e persiste em `CapacityPrescriptionSource.technicalSnapshot` a aplicabilidade, entradas, versão metodológica e resultados calculados. Esse snapshot pertence à versão imutável da prescrição e não é recalculado ao consultar o histórico.",
)
replace_once(
    "docs/product/capacity-prescription-source-provenance.md",
    "- professor responsável, quando a fonte possuir autoria profissional rastreável.",
    "- professor responsável, quando a fonte possuir autoria profissional rastreável;\n- snapshot técnico derivado pelo backend, quando a fonte possuir cálculo versionado, como adipometria.",
)
replace_once(
    "docs/product/capacity-prescription-source-provenance.md",
    "## Alertas derivados",
    textwrap.dedent(
        """
        ## Snapshot técnico da adipometria

        Para fontes `adipometry`, o cliente não é autoridade sobre resultados calculados. O backend reconstrói idade, sexo, peso e dobras a partir do aluno e do registro segmentado, aplica `guedes-three-fold-siri-v1` somente quando o protocolo é aplicável e persiste em `CapacityPrescriptionSource.technicalSnapshot`:

        - protocolo e versão;
        - status `calculated`, `unavailable` ou `not_applicable`;
        - motivo explícito quando o cálculo não pode ser executado;
        - entradas canônicas utilizadas;
        - resultados de composição corporal quando calculados.

        O snapshot é imutável dentro da versão da prescrição. Alterações posteriores na avaliação não reescrevem o cálculo histórico.

        ## Alertas derivados
        """
    ).strip(),
)

print("tests and docs remediation applied")
