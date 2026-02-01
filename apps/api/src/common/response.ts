import { Response } from 'express';

/**
 * Send success response
 */
export function sendSuccess(
  res: Response,
  data: any,
  message?: string,
  statusCode: number = 200
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: any
) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}
