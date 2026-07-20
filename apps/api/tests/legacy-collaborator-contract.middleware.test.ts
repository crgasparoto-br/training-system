import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  legacyCollaboratorContractMiddleware,
  stripLegacyCollaboratorContractFields,
} from '../src/modules/professores/legacy-collaborator-contract.middleware.js';

describe('legacy collaborator contract guard', () => {
  it('removes legacy contract fields without altering the remaining payload', () => {
    expect(stripLegacyCollaboratorContractFields({
      name: 'Colaborador Teste',
      hasSignedContract: true,
      signedContractDocumentUrl: 'https://example.com/legacy.pdf',
      currentStatus: 'Ativo',
    })).toEqual({
      name: 'Colaborador Teste',
      currentStatus: 'Ativo',
    });
  });

  it('returns 410 for the obsolete signed-contract upload endpoint', () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const next = vi.fn();
    const req = {
      path: '/signed-contract-upload',
      method: 'POST',
      body: {},
    } as Request;
    const res = { status, json } as unknown as Response;

    legacyCollaboratorContractMiddleware(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(410);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });
});
