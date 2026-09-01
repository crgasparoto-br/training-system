import { Router } from 'express';
import { workoutService } from '../modules/workout/workout.service.js';

const router: Router = Router();

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

const parseRequiredDate = (value: unknown): Date | null => {
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

// ============================================================================
// WORKOUT TEMPLATE ROUTES
// ============================================================================

// Get or create template
router.post('/templates/get-or-create', async (req, res) => {
  try {
    const weekStartDate = parseRequiredDate(req.body?.weekStartDate);
    if (!weekStartDate) {
      return res.status(400).json({ error: 'Invalid weekStartDate' });
    }

    const template = await workoutService.getOrCreateTemplate({
      ...req.body,
      weekStartDate,
    });
    res.json(template);
  } catch (error: any) {
    console.error('Error in get-or-create template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get template by ID
router.get('/templates/:id', async (req, res) => {
  try {
    const template = await workoutService.getTemplateById(req.params.id);
    res.json(template);
  } catch (error: any) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/templates/:id', async (req, res) => {
  try {
    const template = await workoutService.updateTemplate(req.params.id, req.body);
    res.json(template);
  } catch (error: any) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/templates/:id', async (req, res) => {
  try {
    await workoutService.deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Release template
router.post('/templates/:id/release', async (req, res) => {
  try {
    const template = await workoutService.releaseTemplate(req.params.id);
    res.json(template);
  } catch (error: any) {
    console.error('Error releasing template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Copy template
router.post('/templates/:id/copy', async (req, res) => {
  try {
    const targetWeekStartDate = parseRequiredDate(req.body?.targetWeekStartDate);
    if (!targetWeekStartDate) {
      return res.status(400).json({ error: 'Invalid targetWeekStartDate' });
    }
    const targetWeekNumber = Number(req.body.targetWeekNumber);
    if (!Number.isFinite(targetWeekNumber) || targetWeekNumber <= 0) {
      return res.status(400).json({ error: 'Invalid targetWeekNumber' });
    }
    const template = await workoutService.copyTemplate(
      req.params.id,
      targetWeekNumber,
      targetWeekStartDate
    );
    res.json(template);
  } catch (error: any) {
    console.error('Error copying template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WORKOUT DAY ROUTES
// ============================================================================

// Get or create day
router.post('/days/get-or-create', async (req, res) => {
  try {
    const day = await workoutService.getOrCreateDay(req.body);
    res.json(day);
  } catch (error: any) {
    console.error('Error in get-or-create day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get day by ID
router.get('/days/:id', async (req, res) => {
  try {
    const day = await workoutService.getDay(req.params.id);
    res.json(day);
  } catch (error: any) {
    console.error('Error getting day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update day
router.put('/days/:id', async (req, res) => {
  try {
    const day = await workoutService.updateDay(req.params.id, req.body);
    res.json(day);
  } catch (error: any) {
    console.error('Error updating day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete day
router.delete('/days/:id', async (req, res) => {
  try {
    await workoutService.deleteDay(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Copy day
router.post('/days/:id/copy', async (req, res) => {
  try {
    const day = await workoutService.copyDay(
      req.params.id,
      req.body.targetDayOfWeek,
      req.body.targetDate
    );
    res.json(day);
  } catch (error: any) {
    console.error('Error copying day:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WORKOUT EXERCISE ROUTES
// ============================================================================

// List exercises by workout day
router.get('/exercises', async (req, res) => {
  try {
    const { workoutDayId } = req.query;
    if (!workoutDayId || typeof workoutDayId !== 'string') {
      return res.status(400).json({ error: 'workoutDayId is required' });
    }
    const exercises = await workoutService.getExercises(workoutDayId);
    res.json(exercises);
  } catch (error: any) {
    console.error('Error getting exercises:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add exercise
router.post('/exercises', async (req, res) => {
  try {
    const exercise = await workoutService.addExercise(req.body);
    res.status(201).json(exercise);
  } catch (error: any) {
    console.error('Error adding exercise:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update exercise
router.put('/exercises/:id', async (req, res) => {
  try {
    const exercise = await workoutService.updateExercise(req.params.id, req.body);
    res.json(exercise);
  } catch (error: any) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete exercise
router.delete('/exercises/:id', async (req, res) => {
  try {
    await workoutService.deleteExercise(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder exercises
router.put('/exercises/reorder', async (req, res) => {
  try {
    const { workoutDayId, section, exerciseIds } = req.body as {
      workoutDayId: string;
      section: string;
      exerciseIds: string[];
    };
    await workoutService.reorderExercises(workoutDayId, section, exerciseIds);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error reordering exercises:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
