import fs from 'fs';
import path from 'path';

type UploadKind = 'image' | 'pdf';

type DetectedFileType = {
  mimeType: string;
  extension: string;
};

const IMAGE_TYPES: Record<string, DetectedFileType> = {
  'image/jpeg': { mimeType: 'image/jpeg', extension: '.jpg' },
  'image/png': { mimeType: 'image/png', extension: '.png' },
  'image/webp': { mimeType: 'image/webp', extension: '.webp' },
};

const PDF_TYPE: DetectedFileType = { mimeType: 'application/pdf', extension: '.pdf' };

export function validateUploadMetadata(kind: UploadKind, mimeType: string) {
  if (kind === 'image' && !IMAGE_TYPES[mimeType]) {
    throw new Error('Envie uma imagem JPG, PNG ou WebP valida');
  }

  if (kind === 'pdf' && mimeType !== PDF_TYPE.mimeType) {
    throw new Error('Envie um arquivo PDF valido');
  }
}

export function detectUploadType(buffer: Buffer, kind: UploadKind): DetectedFileType | null {
  if (kind === 'pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-' ? PDF_TYPE : null;
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return IMAGE_TYPES['image/jpeg'];
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    return IMAGE_TYPES['image/png'];
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return IMAGE_TYPES['image/webp'];
  }

  return null;
}

export function assertUploadContent(kind: UploadKind, buffer: Buffer, declaredMimeType: string) {
  validateUploadMetadata(kind, declaredMimeType);

  const detected = detectUploadType(buffer, kind);
  if (!detected || detected.mimeType !== declaredMimeType) {
    throw new Error(kind === 'image' ? 'Envie uma imagem valida' : 'Envie um arquivo PDF valido');
  }

  return detected;
}

export function normalizeUploadFileName(originalName: string, extension: string) {
  const baseName = path.basename(originalName, path.extname(originalName)).trim() || 'file';
  return `${baseName}${extension}`;
}

export function assertStoredUploadContent(file: Express.Multer.File, kind: UploadKind) {
  try {
    const detected = assertUploadContent(kind, fs.readFileSync(file.path), file.mimetype);
    const normalizedName = normalizeUploadFileName(file.filename, detected.extension);

    if (normalizedName !== file.filename) {
      const normalizedPath = path.join(path.dirname(file.path), normalizedName);
      fs.renameSync(file.path, normalizedPath);
      file.filename = normalizedName;
      file.path = normalizedPath;
    }

    file.mimetype = detected.mimeType;
    return detected;
  } catch (error) {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    throw error;
  }
}
