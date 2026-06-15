import { assertUploadContent, validateUploadMetadata } from './upload-validation.js';

const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const webpBuffer = Buffer.from('RIFF1234WEBP', 'ascii');
const pdfBuffer = Buffer.from('%PDF-1.7\n', 'ascii');
const svgBuffer = Buffer.from('<svg><script>alert(1)</script></svg>', 'utf8');

describe('upload validation', () => {
  it('accepts safe image allowlist by declared MIME and magic bytes', () => {
    expect(assertUploadContent('image', pngBuffer, 'image/png')).toEqual({
      mimeType: 'image/png',
      extension: '.png',
    });
    expect(assertUploadContent('image', jpegBuffer, 'image/jpeg')).toEqual({
      mimeType: 'image/jpeg',
      extension: '.jpg',
    });
    expect(assertUploadContent('image', webpBuffer, 'image/webp')).toEqual({
      mimeType: 'image/webp',
      extension: '.webp',
    });
  });

  it('rejects SVG and MIME spoofing for images', () => {
    expect(() => validateUploadMetadata('image', 'image/svg+xml')).toThrow(
      'Envie uma imagem JPG, PNG ou WebP valida'
    );
    expect(() => assertUploadContent('image', svgBuffer, 'image/png')).toThrow(
      'Envie uma imagem valida'
    );
  });

  it('accepts only real PDF content for PDF uploads', () => {
    expect(assertUploadContent('pdf', pdfBuffer, 'application/pdf')).toEqual({
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
    expect(() => assertUploadContent('pdf', svgBuffer, 'application/pdf')).toThrow(
      'Envie um arquivo PDF valido'
    );
  });
});
