import { PrismaClient, type AnthropometrySegmentType, type AnthropometrySexApplicability } from '@prisma/client';

const prisma = new PrismaClient();

type SegmentSeed = {
  name: string;
  type: AnthropometrySegmentType;
  order: number;
  technicalDescription?: string;
  tutorialVideoUrl?: string;
  formulaHint?: string;
  importByDefault?: boolean;
  importObservationByDefault?: boolean;
};

type SegmentInput = {
  name: string;
  description?: string | null;
  technicalDescription?: string | null;
  sexApplicability?: AnthropometrySexApplicability;
  type?: AnthropometrySegmentType;
  order?: number;
  active?: boolean;
  importByDefault?: boolean;
  importObservationByDefault?: boolean;
  femaleImageUrl?: string | null;
  maleImageUrl?: string | null;
  tutorialVideoUrl?: string | null;
  formulaHint?: string | null;
};

type AssessmentValueInput = {
  segmentId: string;
  value?: string | null;
  unit?: string | null;
  observation?: string | null;
};

type ObservationInput = {
  id?: string;
  segmentId?: string | null;
  text: string;
  importable?: boolean;
};

const defaultSegments: SegmentSeed[] = [
  {
    name: 'Olecrano-Acrômio Clavicular',
    type: 'principal',
    order: 10,
    technicalDescription: 'Distância entre o olécrano e a articulação acrômio clavicular.',
    tutorialVideoUrl: 'https://youtube.com/shorts/hQr0hDT3-jM?feature=share',
    formulaHint: 'Referência configurável Antr1.',
  },
  {
    name: 'Ligamento inguinal-borda superior da patela',
    type: 'principal',
    order: 20,
    technicalDescription: 'Distância entre o ligamento inguinal e a borda superior da patela.',
    tutorialVideoUrl: 'https://youtube.com/shorts/yINLphA-FnY',
    formulaHint: 'Referência configurável Antr2.',
  },
  {
    name: 'Escapular',
    type: 'principal',
    order: 30,
    technicalDescription: 'Maior circunferência envolvendo deltoide, em posição neutra.',
    tutorialVideoUrl: 'https://youtube.com/shorts/KjTQWVYxnc4',
  },
  {
    name: 'Torácica Inspirada',
    type: 'principal',
    order: 40,
    technicalDescription: 'Em inspiração máxima. No masculino: linha do mamilo. No feminino: cicatriz axilar.',
    tutorialVideoUrl: 'https://youtube.com/shorts/-K6J5Xmkaiw',
  },
  {
    name: 'Torácica Expirada',
    type: 'principal',
    order: 50,
    technicalDescription: 'Após expiração total. No masculino: linha do mamilo. No feminino: cicatriz axilar.',
    tutorialVideoUrl: 'https://youtube.com/shorts/47v1UFsVuwU',
  },
  {
    name: 'Braço Direito Relaxado',
    type: 'principal',
    order: 60,
    technicalDescription: 'Registrar a maior circunferência do braço relaxado.',
    tutorialVideoUrl: 'https://youtube.com/shorts/SzQGbYR-t-0',
  },
  {
    name: 'Braço Direito Contraído',
    type: 'principal',
    order: 70,
    technicalDescription: 'Registrar a maior circunferência do braço em contração isométrica máxima.',
    tutorialVideoUrl: 'https://youtube.com/shorts/GCAHcLEn4r4',
  },
  {
    name: 'Braço Esquerdo Relaxado',
    type: 'principal',
    order: 80,
    technicalDescription: 'Registrar a maior circunferência do braço relaxado.',
    tutorialVideoUrl: 'https://youtube.com/shorts/SzQGbYR-t-0',
  },
  {
    name: 'Braço Esquerdo Contraído',
    type: 'principal',
    order: 90,
    technicalDescription: 'Registrar a maior circunferência do braço em contração isométrica máxima.',
    tutorialVideoUrl: 'https://youtube.com/shorts/GCAHcLEn4r4',
  },
  {
    name: 'Abdominal',
    type: 'principal',
    order: 100,
    technicalDescription: 'Nível da cicatriz umbilical. Caso a pele esteja caída, usar a região aproximada da cicatriz.',
    tutorialVideoUrl: 'https://youtube.com/shorts/GNTVWiaohNk',
  },
  {
    name: 'Quadril',
    type: 'principal',
    order: 110,
    technicalDescription: 'Maior circunferência do glúteo.',
    tutorialVideoUrl: 'https://youtube.com/shorts/VC6bA3T6uAc',
  },
  {
    name: 'Coxa Direita',
    type: 'principal',
    order: 120,
    technicalDescription: 'Linha horizontal a metade da distância entre ligamento inguinal e borda superior da patela.',
    tutorialVideoUrl: 'https://youtube.com/shorts/2fBpsn0Mrxc',
    formulaHint: 'Pode usar metade de Antr2, conforme configuração do segmento.',
  },
  {
    name: 'Perna Direita',
    type: 'principal',
    order: 130,
    technicalDescription: 'Maior circunferência da panturrilha.',
    tutorialVideoUrl: 'https://youtube.com/shorts/uO3aIhS9sJo',
  },
  {
    name: 'Coxa Esquerda',
    type: 'principal',
    order: 140,
    technicalDescription: 'Linha horizontal a metade da distância entre ligamento inguinal e borda superior da patela.',
    tutorialVideoUrl: 'https://youtube.com/shorts/2fBpsn0Mrxc',
    formulaHint: 'Pode usar metade de Antr2, conforme configuração do segmento.',
  },
  {
    name: 'Perna Esquerda',
    type: 'principal',
    order: 150,
    technicalDescription: 'Maior circunferência da panturrilha.',
    tutorialVideoUrl: 'https://youtube.com/shorts/uO3aIhS9sJo',
  },
  { name: 'Pescoço', type: 'opcional', order: 210, technicalDescription: 'Imediatamente abaixo da proeminência laríngea.', tutorialVideoUrl: 'https://youtube.com/shorts/gL6DAAPmmBI', importByDefault: false },
  { name: 'Busto', type: 'opcional', order: 220, technicalDescription: 'Circunferência de maior projeção anterior da região torácica.', tutorialVideoUrl: 'https://youtube.com/shorts/mQWFLtR-46w', importByDefault: false },
  { name: 'Cintura', type: 'opcional', order: 230, technicalDescription: 'Imediatamente abaixo da última costela, observada pela linha axilar.', tutorialVideoUrl: 'https://youtube.com/shorts/hB-JPtlwdkU', importByDefault: false },
  { name: 'Antebraço Direito', type: 'opcional', order: 240, technicalDescription: 'Maior circunferência do antebraço.', tutorialVideoUrl: 'https://youtube.com/shorts/VMbxWWPY0d0', importByDefault: false },
  { name: 'Antebraço Esquerdo', type: 'opcional', order: 250, technicalDescription: 'Maior circunferência do antebraço.', tutorialVideoUrl: 'https://youtube.com/shorts/VMbxWWPY0d0', importByDefault: false },
  { name: 'Crista Ilíaca', type: 'opcional', order: 260, technicalDescription: 'Imediatamente acima da borda superior da crista ilíaca.', tutorialVideoUrl: 'https://youtube.com/shorts/7S-MFLxdLq4', importByDefault: false },
  { name: 'Coxa Alta Direita', type: 'opcional', order: 270, technicalDescription: 'Imediatamente abaixo do glúteo.', tutorialVideoUrl: 'https://youtube.com/shorts/oqYNuFG2lj0', importByDefault: false },
  { name: 'Coxa Alta Esquerda', type: 'opcional', order: 280, technicalDescription: 'Imediatamente abaixo do glúteo.', tutorialVideoUrl: 'https://youtube.com/shorts/oqYNuFG2lj0', importByDefault: false },
  { name: 'Coxa Baixa Direita', type: 'opcional', order: 290, technicalDescription: 'Imediatamente acima da borda superior da patela.', tutorialVideoUrl: 'https://youtube.com/shorts/XKD-GSrrg4M?feature=share', importByDefault: false },
  { name: 'Coxa Baixa Esquerda', type: 'opcional', order: 300, technicalDescription: 'Imediatamente acima da borda superior da patela.', tutorialVideoUrl: 'https://youtube.com/shorts/XKD-GSrrg4M?feature=share', importByDefault: false },
];

const includeAssessment = {
  professor: { include: { user: { include: { profile: true } } } },
  values: { include: { segment: true }, orderBy: { segment: { order: 'asc' as const } } },
  observations: { include: { segment: true }, orderBy: { createdAt: 'asc' as const } },
};

function nextCodeFrom(code?: string | null) {
  const match = code?.match(/ANTR-(\d+)/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `ANTR-${String(next).padStart(3, '0')}`;
}

async function assertAlunoInContract(alunoId: string, contractId: string) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, professor: { contractId } },
    include: { user: { include: { profile: true } }, professor: true },
  });
  if (!aluno) throw new Error('Aluno não encontrado no contrato');
  return aluno;
}

export const anthropometryService = {
  async ensureDefaultSegments(contractId: string) {
    await prisma.anthropometrySegment.createMany({
      skipDuplicates: true,
      data: defaultSegments.map((segment) => ({
        contractId,
        name: segment.name,
        type: segment.type,
        order: segment.order,
        technicalDescription: segment.technicalDescription,
        tutorialVideoUrl: segment.tutorialVideoUrl,
        formulaHint: segment.formulaHint,
        importByDefault: segment.importByDefault ?? true,
        importObservationByDefault: segment.importObservationByDefault ?? false,
      })),
    });
  },

  async listSegments(contractId: string) {
    await this.ensureDefaultSegments(contractId);
    return prisma.anthropometrySegment.findMany({
      where: { contractId },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  },

  async listActiveSegments(contractId: string, sex?: 'male' | 'female' | 'other') {
    await this.ensureDefaultSegments(contractId);
    const sexApplicability =
      sex === 'male' ? ['masculino', 'ambos'] : sex === 'female' ? ['feminino', 'ambos'] : ['ambos', 'masculino', 'feminino'];

    return prisma.anthropometrySegment.findMany({
      where: {
        contractId,
        active: true,
        sexApplicability: { in: sexApplicability as AnthropometrySexApplicability[] },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  },

  async createSegment(contractId: string, data: SegmentInput) {
    return prisma.anthropometrySegment.create({
      data: {
        contractId,
        name: data.name,
        description: data.description,
        technicalDescription: data.technicalDescription,
        sexApplicability: data.sexApplicability ?? 'ambos',
        type: data.type ?? 'personalizado',
        order: data.order ?? 999,
        active: data.active ?? true,
        importByDefault: data.importByDefault ?? true,
        importObservationByDefault: data.importObservationByDefault ?? false,
        femaleImageUrl: data.femaleImageUrl,
        maleImageUrl: data.maleImageUrl,
        tutorialVideoUrl: data.tutorialVideoUrl,
        formulaHint: data.formulaHint,
      },
    });
  },

  async updateSegment(contractId: string, id: string, data: Partial<SegmentInput>) {
    await prisma.anthropometrySegment.findFirstOrThrow({ where: { id, contractId } });
    return prisma.anthropometrySegment.update({ where: { id }, data });
  },

  async reorderSegments(contractId: string, segmentIds: string[]) {
    await prisma.$transaction(
      segmentIds.map((id, index) =>
        prisma.anthropometrySegment.updateMany({
          where: { id, contractId },
          data: { order: (index + 1) * 10 },
        })
      )
    );
    return this.listSegments(contractId);
  },

  async listAssessments(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    return prisma.anthropometryAssessment.findMany({
      where: { contractId, alunoId },
      include: includeAssessment,
      orderBy: { assessmentDate: 'desc' },
    });
  },

  async getAssessment(contractId: string, id: string) {
    return prisma.anthropometryAssessment.findFirst({
      where: { id, contractId },
      include: includeAssessment,
    });
  },

  async getLastAssessment(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    return prisma.anthropometryAssessment.findFirst({
      where: { contractId, alunoId },
      include: includeAssessment,
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async createAssessment(contractId: string, alunoId: string, professorId: string, data: { assessmentDate?: Date; professorId?: string | null; notes?: string | null; copyPrevious?: boolean }) {
    const aluno = await assertAlunoInContract(alunoId, contractId);
    await this.ensureDefaultSegments(contractId);
    const [lastAssessment, activeSegments] = await Promise.all([
      this.getLastAssessment(contractId, alunoId),
      this.listActiveSegments(contractId, aluno.user.profile?.gender ?? undefined),
    ]);

    const code = nextCodeFrom(lastAssessment?.code);
    const sourceValues = new Map(lastAssessment?.values.map((item) => [item.segmentId, item]) ?? []);
    const requestedProfessorId = data.professorId || professorId || aluno.professorId;
    const targetProfessor = await prisma.professor.findFirst({
      where: { id: requestedProfessorId, contractId },
      select: { id: true },
    });
    const targetProfessorId = targetProfessor?.id ?? professorId ?? aluno.professorId;

    return prisma.$transaction(async (tx) => {
      const assessment = await tx.anthropometryAssessment.create({
        data: {
          contractId,
          alunoId,
          professorId: targetProfessorId,
          code,
          assessmentDate: data.assessmentDate ?? new Date(),
          notes: data.copyPrevious && lastAssessment?.notes ? lastAssessment.notes : data.notes,
        },
      });

      const valuesToCreate = activeSegments.map((segment) => {
        const source = sourceValues.get(segment.id);
        return {
          assessmentId: assessment.id,
          segmentId: segment.id,
          value: data.copyPrevious && segment.importByDefault ? source?.value ?? null : null,
          unit: source?.unit ?? 'cm',
          observation:
            data.copyPrevious && segment.importObservationByDefault ? source?.observation ?? null : null,
        };
      });

      const observationsToCreate =
        data.copyPrevious && lastAssessment
          ? lastAssessment.observations
              .filter((item) => item.importable || item.segment?.importObservationByDefault)
              .map((item) => ({
                assessmentId: assessment.id,
                segmentId: item.segmentId,
                text: item.text,
                importable: item.importable,
              }))
          : [];

      if (valuesToCreate.length) {
        await tx.anthropometryAssessmentValue.createMany({
          data: valuesToCreate,
          skipDuplicates: true,
        });
      }

      if (observationsToCreate.length) {
        await tx.anthropometryObservation.createMany({
          data: observationsToCreate,
        });
      }

      return tx.anthropometryAssessment.findUniqueOrThrow({
        where: { id: assessment.id },
        include: includeAssessment,
      });
    });
  },

  async updateAssessment(contractId: string, id: string, data: { assessmentDate?: Date; professorId?: string | null; notes?: string | null }) {
    const existing = await prisma.anthropometryAssessment.findFirstOrThrow({ where: { id, contractId } });
    return prisma.anthropometryAssessment.update({
      where: { id: existing.id },
      data,
      include: includeAssessment,
    });
  },

  async saveValues(contractId: string, assessmentId: string, values: AssessmentValueInput[]) {
    const assessment = await prisma.anthropometryAssessment.findFirstOrThrow({
      where: { id: assessmentId, contractId },
    });

    await prisma.$transaction(
      values.map((item) =>
        prisma.anthropometryAssessmentValue.upsert({
          where: { assessmentId_segmentId: { assessmentId: assessment.id, segmentId: item.segmentId } },
          create: {
            assessmentId: assessment.id,
            segmentId: item.segmentId,
            value: item.value,
            unit: item.unit || 'cm',
            observation: item.observation,
          },
          update: {
            value: item.value,
            unit: item.unit || 'cm',
            observation: item.observation,
          },
        })
      )
    );

    return this.getAssessment(contractId, assessment.id);
  },

  async saveObservations(contractId: string, assessmentId: string, observations: ObservationInput[]) {
    const assessment = await prisma.anthropometryAssessment.findFirstOrThrow({
      where: { id: assessmentId, contractId },
    });

    await prisma.$transaction(async (tx) => {
      await tx.anthropometryObservation.deleteMany({ where: { assessmentId: assessment.id } });
      if (observations.length) {
        await tx.anthropometryObservation.createMany({
          data: observations
            .filter((item) => item.text.trim())
            .map((item) => ({
              assessmentId: assessment.id,
              segmentId: item.segmentId || null,
              text: item.text.trim(),
              importable: item.importable ?? false,
            })),
        });
      }
    });

    return this.getAssessment(contractId, assessment.id);
  },

  async compare(contractId: string, alunoId: string, assessmentIds?: string[]) {
    const assessments = assessmentIds?.length
      ? await prisma.anthropometryAssessment.findMany({
          where: { contractId, alunoId, id: { in: assessmentIds } },
          include: includeAssessment,
          orderBy: { assessmentDate: 'asc' },
        })
      : await prisma.anthropometryAssessment.findMany({
          where: { contractId, alunoId },
          include: includeAssessment,
          orderBy: { assessmentDate: 'asc' },
        });

    return assessments;
  },
};
