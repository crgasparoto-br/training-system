import type { NextFunction, Request, Response } from 'express';
import { classifyResistanceWriteError } from '../modules/workout/resistance-structure.domain.js';
import { prismaRuntimeClient } from '../common/prisma-runtime-client.js';

/** Keep raw Prisma/SQL errors in server logs, never in legacy HTTP responses. */
export function sendSafeWorkoutError(res: Response, error: unknown) {
  const mapped = classifyResistanceWriteError(error);
  if (mapped.status !== 500) {
    return res.status(mapped.status).json(mapped.body);
  }
  return res.status(500).json({
    code: 'WORKOUT_OPERATION_FAILED',
    error: 'Não foi possível concluir a operação de treino.',
  });
}


/**
 * Protect every Workout Builder route, including the legacy exercise API.
 * Route parameters and body ids never grant access across contracts.
 */
export async function workoutContractScopeMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const contractId = req.user?.contractId;
    if (!contractId) return res.status(403).json({ code: 'FORBIDDEN', error: 'Acesso negado.' });
    const [resource, id] = req.path.split('/').filter(Boolean);
    let allowed = false;
    if (resource === 'templates') {
      if (id === 'get-or-create' && req.method === 'POST') {
        allowed = typeof req.body?.planId === 'string' && Boolean(await prismaRuntimeClient.trainingPlan.findFirst({
          where: { id: req.body.planId, aluno: { contractId } }, select: { id: true },
        }));
      } else if (id) {
        allowed = Boolean(await prismaRuntimeClient.workoutTemplate.findFirst({
          where: { id, plan: { aluno: { contractId } } }, select: { id: true },
        }));
      }
    } else if (resource === 'days') {
      if (id === 'get-or-create' && req.method === 'POST') {
        allowed = typeof req.body?.templateId === 'string' && Boolean(await prismaRuntimeClient.workoutTemplate.findFirst({
          where: { id: req.body.templateId, plan: { aluno: { contractId } } }, select: { id: true },
        }));
      } else if (id) {
        allowed = Boolean(await prismaRuntimeClient.workoutDay.findFirst({
          where: { id, template: { plan: { aluno: { contractId } } } }, select: { id: true },
        }));
      }
    } else if (resource === 'exercises') {
      if (!id || id === 'reorder') {
        const dayId = req.method === 'GET' ? req.query.workoutDayId : req.body?.workoutDayId;
        allowed = typeof dayId === 'string' && Boolean(await prismaRuntimeClient.workoutDay.findFirst({
          where: { id: dayId, template: { plan: { aluno: { contractId } } } }, select: { id: true },
        }));
      } else {
        allowed = Boolean(await prismaRuntimeClient.workoutExercise.findFirst({
          where: { id, workoutDay: { template: { plan: { aluno: { contractId } } } } },
          select: { id: true },
        }));
        if (allowed && req.body?.workoutDayId !== undefined) {
          allowed = typeof req.body.workoutDayId === 'string' && Boolean(await prismaRuntimeClient.workoutDay.findFirst({
            where: { id: req.body.workoutDayId, template: { plan: { aluno: { contractId } } } },
            select: { id: true },
          }));
        }
      }
      if (allowed && (req.method === 'POST' || req.method === 'PUT') && id !== 'reorder'
        && req.body?.exerciseId !== undefined) {
        allowed = typeof req.body.exerciseId === 'string' && Boolean(await prismaRuntimeClient.exerciseLibrary.findFirst({
          where: { id: req.body.exerciseId, contractId }, select: { id: true },
        }));
      }
    }
    if (!allowed) {
      return res.status(404).json({ code: 'RESISTANCE_DAY_NOT_FOUND', error: 'Treino não encontrado.' });
    }
    next();
  } catch (error) {
    console.error('Error validating workout contract scope:', error);
    return res.status(500).json({ code: 'WORKOUT_SCOPE_CHECK_FAILED', error: 'Não foi possível verificar o acesso.' });
  }
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_NAME_PATTERN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PART_SEPARATOR = '[^a-z0-9]+';
const OPTIONAL_WEEKDAY_PREFIX = `(?:[a-z]{3,9}${DATE_PART_SEPARATOR})?`;
const YEAR_FIRST_NUMERIC_DATE = new RegExp(
  `^${OPTIONAL_WEEKDAY_PREFIX}(\\d{4})${DATE_PART_SEPARATOR}(\\d{1,2})${DATE_PART_SEPARATOR}(\\d{1,2})(?=$|[^0-9])`,
  'i'
);
const MONTH_FIRST_NUMERIC_DATE = new RegExp(
  `^${OPTIONAL_WEEKDAY_PREFIX}(\\d{1,2})${DATE_PART_SEPARATOR}(\\d{1,2})${DATE_PART_SEPARATOR}(\\d{2}|\\d{4})(?=$|[^0-9])`,
  'i'
);
const MONTH_FIRST_TEXT_DATE = new RegExp(
  `^${OPTIONAL_WEEKDAY_PREFIX}${MONTH_NAME_PATTERN}${DATE_PART_SEPARATOR}(\\d{1,2})${DATE_PART_SEPARATOR}(\\d{2}|\\d{4})(?=$|[^0-9])`,
  'i'
);
const DAY_FIRST_TEXT_DATE = new RegExp(
  `^${OPTIONAL_WEEKDAY_PREFIX}(\\d{1,2})${DATE_PART_SEPARATOR}${MONTH_NAME_PATTERN}${DATE_PART_SEPARATOR}(\\d{2}|\\d{4})(?=$|[^0-9])`,
  'i'
);
const YEAR_FIRST_TEXT_DATE = new RegExp(
  `^${OPTIONAL_WEEKDAY_PREFIX}(\\d{4})${DATE_PART_SEPARATOR}${MONTH_NAME_PATTERN}${DATE_PART_SEPARATOR}(\\d{1,2})(?=$|[^0-9])`,
  'i'
);

type ExplicitCalendarDate = {
  year: number;
  month: number;
  day: number;
};

const normalizeExplicitYear = (value: string): number => {
  const year = Number(value);
  if (value.length !== 2) {
    return year;
  }
  return year <= 49 ? 2000 + year : 1900 + year;
};

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
};

const getExplicitCalendarDate = (value: string): ExplicitCalendarDate | null => {
  const yearFirstNumeric = value.match(YEAR_FIRST_NUMERIC_DATE);
  if (yearFirstNumeric) {
    return {
      year: Number(yearFirstNumeric[1]),
      month: Number(yearFirstNumeric[2]),
      day: Number(yearFirstNumeric[3]),
    };
  }

  const monthFirstNumeric = value.match(MONTH_FIRST_NUMERIC_DATE);
  if (monthFirstNumeric) {
    return {
      year: normalizeExplicitYear(monthFirstNumeric[3]),
      month: Number(monthFirstNumeric[1]),
      day: Number(monthFirstNumeric[2]),
    };
  }

  const monthFirstText = value.match(MONTH_FIRST_TEXT_DATE);
  if (monthFirstText) {
    return {
      year: normalizeExplicitYear(monthFirstText[3]),
      month: MONTH_INDEX[monthFirstText[1].toLowerCase()],
      day: Number(monthFirstText[2]),
    };
  }

  const dayFirstText = value.match(DAY_FIRST_TEXT_DATE);
  if (dayFirstText) {
    return {
      year: normalizeExplicitYear(dayFirstText[3]),
      month: MONTH_INDEX[dayFirstText[2].toLowerCase()],
      day: Number(dayFirstText[1]),
    };
  }

  const yearFirstText = value.match(YEAR_FIRST_TEXT_DATE);
  if (yearFirstText) {
    return {
      year: Number(yearFirstText[1]),
      month: MONTH_INDEX[yearFirstText[2].toLowerCase()],
      day: Number(yearFirstText[3]),
    };
  }

  return null;
};

const hasImpossibleExplicitCalendarDate = (value: string): boolean => {
  const explicitDate = getExplicitCalendarDate(value);
  return explicitDate
    ? !isValidCalendarDate(explicitDate.year, explicitDate.month, explicitDate.day)
    : false;
};

export const parseRequiredDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const candidate = value.trim();
  if (/^[+-]?\d+(?:\.\d+)?$/.test(candidate) || hasImpossibleExplicitCalendarDate(candidate)) {
    return null;
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
