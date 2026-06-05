import { Router, Request, Response } from 'express';
import multer from 'multer';
import { sendSuccess, sendError } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { savePublicAsset } from '../../common/supabase-storage.js';

const router: Router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Envie um arquivo de imagem válido'));
    }

    cb(null, true);
  },
});

const uploadAvatarFile = (req: Request, res: Response, next: any) => {
  avatarUpload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao fazer upload da foto', 400);
    }

    next();
  });
};

router.use(authMiddleware);
router.use(professorMiddleware);

router.post('/avatar-upload', uploadAvatarFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'Selecione uma imagem para upload', 400);
    }

    const asset = await savePublicAsset({
      folder: 'alunos',
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    return sendSuccess(res, { url: asset.url }, 'Foto enviada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao enviar foto', 400);
  }
});

export default router;
