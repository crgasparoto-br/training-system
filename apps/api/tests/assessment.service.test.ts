import fs from 'fs';
import os from 'os';
import path from 'path';

const mockDb = {
  assessment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  assessmentType: {
    findMany: jest.fn(),
  },
  alunoAssessmentPlanItem: {
    findMany: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockDb),
}));

import { assessmentService, type CreateAssessmentDTO } from '../src/modules/assessments/assessment.service';

const originalUploadStorageRoot = process.env.UPLOAD_STORAGE_ROOT;
let tempUploadRoot: string | undefined;

function createDto(overrides: Partial<CreateAssessmentDTO> = {}): CreateAssessmentDTO {
  return {
    alunoId: 'aluno-1',
    professorId: 'professor-1',
    typeId: 'type-1',
    assessmentDate: new Date('2026-06-15T12:00:00.000Z'),
    filePath: 'uploads/assessments/file.pdf',
    originalFileName: 'file.pdf',
    mimeType: 'application/pdf',
    fileSize: 128,
    extractedData: { parseOk: true },
    ...overrides,
  };
}

describe('assessmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tempUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'assessment-upload-'));
    process.env.UPLOAD_STORAGE_ROOT = tempUploadRoot;
  });

  afterEach(() => {
    if (tempUploadRoot && fs.existsSync(tempUploadRoot)) {
      fs.rmSync(tempUploadRoot, { recursive: true, force: true });
    }

    tempUploadRoot = undefined;

    if (originalUploadStorageRoot === undefined) {
      delete process.env.UPLOAD_STORAGE_ROOT;
    } else {
      process.env.UPLOAD_STORAGE_ROOT = originalUploadStorageRoot;
    }
  });

  it('remove arquivo e nao persiste avaliacao quando o PDF nao pode ser lido', async () => {
    const uploadDir = path.join(tempUploadRoot!, 'assessments');
    fs.mkdirSync(uploadDir, { recursive: true });
    const uploadedPath = path.join(uploadDir, 'invalid.pdf');
    fs.writeFileSync(uploadedPath, Buffer.from('not a pdf'));

    await expect(
      assessmentService.create(
        createDto({
          filePath: 'uploads/assessments/invalid.pdf',
          extractedData: { parseOk: false, error: 'Invalid PDF structure' },
        }),
      ),
    ).rejects.toThrow('Somente arquivos PDF validos');

    expect(fs.existsSync(uploadedPath)).toBe(false);
    expect(mockDb.assessment.create).not.toHaveBeenCalled();
  });

  it('persiste avaliacao quando os dados extraidos sao validos', async () => {
    mockDb.assessment.create.mockResolvedValue({ id: 'assessment-1' });

    await expect(assessmentService.create(createDto())).resolves.toEqual({ id: 'assessment-1' });

    expect(mockDb.assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alunoId: 'aluno-1',
          mimeType: 'application/pdf',
          extractedData: { parseOk: true },
        }),
        include: { type: true },
      }),
    );
  });
});