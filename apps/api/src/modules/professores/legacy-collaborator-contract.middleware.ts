import type { NextFunction, Request, Response } from 'express';

const LEGACY_FIELDS = ['hasSignedContract', 'signedContractDocumentUrl'] as const;

export const stripLegacyCollaboratorContractFields = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const sanitized = { ...(body as Record<string, unknown>) };
  for (const field of LEGACY_FIELDS) delete sanitized[field];
  return sanitized;
};

export const legacyCollaboratorContractMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.path === '/signed-contract-upload') {
    return res.status(410).json({
      success: false,
      error: 'O upload legado foi desativado. Use o controle contratual na edição do colaborador.',
    });
  }

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    req.body = stripLegacyCollaboratorContractFields(req.body);
  }

  return next();
};
