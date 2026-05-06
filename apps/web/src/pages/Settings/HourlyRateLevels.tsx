import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { HourlyRateLevel } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { settingsHourlyRateLevelsCopy } from '../../i18n/ptBR';
import { hourlyRateLevelService } from '../../services/hourly-rate-level.service';
import { getHourlyRateLevelBadgeClassName } from '../../utils/hourlyRateLevelTone';

type EditableLevel = HourlyRateLevel & {
  minValueInput: string;
  maxValueInput: string;
};

type LevelFieldErrors = {
  label?: string;
  minValueInput?: string;
  maxValueInput?: string;
  range?: string;
};

function formatValue(value?: number | null) {
  if (typeof value !== 'number') {
    return '';
  }

  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getFormState(levels: HourlyRateLevel[]): EditableLevel[] {
  return levels.map((level) => ({
    ...level,
    minValueInput: formatValue(level.minValue),
    maxValueInput: formatValue(level.maxValue),
  }));
}

function normalizePtBrMoneyInput(value: string) {
  const sanitizedValue = value.replace(/[^\d,.-]/g, '').replace(/\./g, ',');
  const isNegative = sanitizedValue.startsWith('-');
  const unsignedValue = sanitizedValue.replace(/-/g, '');
  const [integerPartRaw = '', ...decimalParts] = unsignedValue.split(',');
  const integerPart = integerPartRaw.replace(/\D/g, '');
  const decimalPart = decimalParts.join('').replace(/\D/g, '').slice(0, 2);

  const prefix = isNegative ? '-' : '';

  if (unsignedValue.includes(',')) {
    return `${prefix}${integerPart},${decimalPart}`;
  }

  return `${prefix}${integerPart}`;
}

function parseValue(value: string) {
  const normalizedValue = value.trim().replace(/\./g, '').replace(',', '.');
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function reorderLevels(levels: EditableLevel[], fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= levels.length) {
    return levels;
  }

  const nextLevels = [...levels];
  const [movedLevel] = nextLevels.splice(fromIndex, 1);
  nextLevels.splice(toIndex, 0, movedLevel);
  return nextLevels;
}

function getLevelFieldErrors(level: EditableLevel): LevelFieldErrors {
  const minValue = parseValue(level.minValueInput);
  const maxValue = parseValue(level.maxValueInput);
  const hasMin = minValue !== null;
  const hasMax = maxValue !== null;

  const errors: LevelFieldErrors = {};

  if (!level.label.trim()) {
    errors.label = settingsHourlyRateLevelsCopy.labelRequired;
  }

  if (hasMin !== hasMax) {
    errors.minValueInput = settingsHourlyRateLevelsCopy.minMaxPairRequired;
    errors.maxValueInput = settingsHourlyRateLevelsCopy.minMaxPairRequired;
  }

  if (hasMin && hasMax && typeof minValue === 'number' && typeof maxValue === 'number' && minValue > maxValue) {
    errors.range = settingsHourlyRateLevelsCopy.invalidRange;
  }

  return errors;
}

function hasAnyLevelError(levelErrors: LevelFieldErrors[]) {
  return levelErrors.some((errors) =>
    Boolean(errors.label || errors.minValueInput || errors.maxValueInput || errors.range)
  );
}

function hasOverlappingRanges(levels: EditableLevel[]) {
  let previousMax: number | null = null;

  for (const level of levels) {
    const minValue = parseValue(level.minValueInput);
    const maxValue = parseValue(level.maxValueInput);

    if (minValue === null || maxValue === null) {
      continue;
    }

    if (previousMax !== null && minValue <= previousMax) {
      return true;
    }

    previousMax = maxValue;
  }

  return false;
}

export default function SettingsHourlyRateLevels() {
  const [levels, setLevels] = useState<EditableLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBusy = loading || saving || creating || !!deletingId;

  const levelErrors = useMemo(() => levels.map(getLevelFieldErrors), [levels]);
  const hasFieldErrors = useMemo(() => hasAnyLevelError(levelErrors), [levelErrors]);
  const hasRangeOverlap = useMemo(() => hasOverlappingRanges(levels), [levels]);

  const configuredCount = useMemo(
    () =>
      levels.filter(
        (level) => parseValue(level.minValueInput) !== null && parseValue(level.maxValueInput) !== null
      ).length,
    [levels]
  );
  const pendingCount = levels.length - configuredCount;

  const loadLevels = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await hourlyRateLevelService.list();
      setLevels(getFormState(data));
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsHourlyRateLevelsCopy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLevels();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (hasFieldErrors) {
      setError(settingsHourlyRateLevelsCopy.saveInvalid);
      return;
    }

    if (hasRangeOverlap) {
      setError(settingsHourlyRateLevelsCopy.overlapWarning);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updatedLevels = await hourlyRateLevelService.update(
        levels.map((level, index) => ({
          id: level.id,
          label: level.label,
          code: level.code,
          order: index + 1,
          minValue: parseValue(level.minValueInput),
          maxValue: parseValue(level.maxValueInput),
        }))
      );

      setLevels(getFormState(updatedLevels));
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsHourlyRateLevelsCopy.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLevel = async () => {
    setCreating(true);
    setError(null);

    try {
      const updatedLevels = await hourlyRateLevelService.create();
      setLevels(getFormState(updatedLevels));
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsHourlyRateLevelsCopy.createError);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteLevel = async (levelId: string) => {
    if (!window.confirm(settingsHourlyRateLevelsCopy.deleteConfirm)) {
      return;
    }

    setDeletingId(levelId);
    setError(null);

    try {
      const updatedLevels = await hourlyRateLevelService.remove(levelId);
      setLevels(getFormState(updatedLevels));
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsHourlyRateLevelsCopy.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  const updateLevelField = (levelId: string, field: 'label' | 'minValueInput' | 'maxValueInput', value: string) => {
    setLevels((current) =>
      current.map((level) =>
        level.id === levelId
          ? {
              ...level,
              [field]: value,
            }
          : level
      )
    );
  };

  const handleMoneyBlur = (levelId: string, field: 'minValueInput' | 'maxValueInput') => {
    setLevels((current) =>
      current.map((level) => {
        if (level.id !== levelId) {
          return level;
        }

        const parsedValue = parseValue(level[field]);

        return {
          ...level,
          [field]: parsedValue === null ? '' : formatValue(parsedValue),
        };
      })
    );
  };

  const handleMoveLevel = (levelId: string, direction: 'up' | 'down') => {
    setLevels((current) => {
      const currentIndex = current.findIndex((level) => level.id === levelId);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      return reorderLevels(current, currentIndex, targetIndex);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{settingsHourlyRateLevelsCopy.title}</h1>
          <p className="text-sm text-muted-foreground">{settingsHourlyRateLevelsCopy.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={loadLevels} disabled={isBusy}>
            {settingsHourlyRateLevelsCopy.refresh}
          </Button>
          <Button type="button" variant="secondary" onClick={handleCreateLevel} disabled={isBusy}>
            <Plus size={16} />
            {settingsHourlyRateLevelsCopy.addLevel}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {hasRangeOverlap && !error && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {settingsHourlyRateLevelsCopy.overlapWarning}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{settingsHourlyRateLevelsCopy.totalLevels}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{levels.length}</p>
          </CardContent>
        </Card>
        <Card className="border-success/20 bg-success/10">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{settingsHourlyRateLevelsCopy.configuredLevels}</p>
            <p className="mt-1 text-2xl font-semibold text-success">{configuredCount}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/20 bg-warning/10">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{settingsHourlyRateLevelsCopy.pendingLevels}</p>
            <p className="mt-1 text-2xl font-semibold text-warning">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{settingsHourlyRateLevelsCopy.cardTitle}</CardTitle>
          <CardDescription>{settingsHourlyRateLevelsCopy.cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.orderLabel}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.levelNameColumn}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.minValueColumn}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.maxValueColumn}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.statusColumn}</th>
                    <th className="px-3 py-2 text-right">{settingsHourlyRateLevelsCopy.actionsColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        {settingsHourlyRateLevelsCopy.loadingLevels}
                      </td>
                    </tr>
                  ) : (
                    levels.map((level, levelIndex) => {
                      const isConfigured =
                        parseValue(level.minValueInput) !== null && parseValue(level.maxValueInput) !== null;
                      const rowErrors = levelErrors[levelIndex];

                      return (
                        <tr key={level.id} className="border-b align-top">
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                              {levelIndex + 1}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              label=""
                              value={level.label}
                              error={rowErrors?.label}
                              onChange={(event) => updateLevelField(level.id, 'label', event.target.value)}
                              placeholder={settingsHourlyRateLevelsCopy.levelNamePlaceholder}
                            />
                            <div className="mt-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${getHourlyRateLevelBadgeClassName(level.label)}`}
                              >
                                {level.label.trim() || settingsHourlyRateLevelsCopy.levelNamePlaceholder}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              label=""
                              type="text"
                              inputMode="decimal"
                              value={level.minValueInput}
                              error={rowErrors?.minValueInput || rowErrors?.range}
                              onChange={(event) =>
                                updateLevelField(level.id, 'minValueInput', normalizePtBrMoneyInput(event.target.value))
                              }
                              onBlur={() => handleMoneyBlur(level.id, 'minValueInput')}
                              placeholder={settingsHourlyRateLevelsCopy.minValuePlaceholder}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              label=""
                              type="text"
                              inputMode="decimal"
                              value={level.maxValueInput}
                              error={rowErrors?.maxValueInput || rowErrors?.range}
                              onChange={(event) =>
                                updateLevelField(level.id, 'maxValueInput', normalizePtBrMoneyInput(event.target.value))
                              }
                              onBlur={() => handleMoneyBlur(level.id, 'maxValueInput')}
                              placeholder={settingsHourlyRateLevelsCopy.maxValuePlaceholder}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${
                                isConfigured
                                  ? 'bg-success/10 text-success'
                                  : 'bg-warning/10 text-warning'
                              }`}
                            >
                              {isConfigured
                                ? settingsHourlyRateLevelsCopy.configuredStatus
                                : settingsHourlyRateLevelsCopy.pendingStatus}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMoveLevel(level.id, 'up')}
                                disabled={isBusy || levelIndex === 0}
                                aria-label={settingsHourlyRateLevelsCopy.moveUp}
                                title={settingsHourlyRateLevelsCopy.moveUp}
                              >
                                <ArrowUp size={16} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMoveLevel(level.id, 'down')}
                                disabled={isBusy || levelIndex === levels.length - 1}
                                aria-label={settingsHourlyRateLevelsCopy.moveDown}
                                title={settingsHourlyRateLevelsCopy.moveDown}
                              >
                                <ArrowDown size={16} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleDeleteLevel(level.id)}
                                disabled={isBusy || deletingId === level.id}
                              >
                                <Trash2 size={16} />
                                <span className="hidden lg:inline">{settingsHourlyRateLevelsCopy.deleteLevel}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 md:hidden">
              {loading ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  {settingsHourlyRateLevelsCopy.loadingLevels}
                </div>
              ) : (
                levels.map((level, levelIndex) => {
                  const isConfigured =
                    parseValue(level.minValueInput) !== null && parseValue(level.maxValueInput) !== null;
                  const rowErrors = levelErrors[levelIndex];

                  return (
                    <div key={level.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {settingsHourlyRateLevelsCopy.orderLabel} {levelIndex + 1}
                          </p>
                          <p className="text-sm font-semibold text-foreground">{settingsHourlyRateLevelsCopy.levelCardTitle}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            isConfigured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                          }`}
                        >
                          {isConfigured
                            ? settingsHourlyRateLevelsCopy.configuredStatus
                            : settingsHourlyRateLevelsCopy.pendingStatus}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <Input
                          label={settingsHourlyRateLevelsCopy.levelNameColumn}
                          value={level.label}
                          error={rowErrors?.label}
                          onChange={(event) => updateLevelField(level.id, 'label', event.target.value)}
                          placeholder={settingsHourlyRateLevelsCopy.levelNamePlaceholder}
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label={settingsHourlyRateLevelsCopy.minValueColumn}
                            type="text"
                            inputMode="decimal"
                            value={level.minValueInput}
                            error={rowErrors?.minValueInput || rowErrors?.range}
                            onChange={(event) =>
                              updateLevelField(level.id, 'minValueInput', normalizePtBrMoneyInput(event.target.value))
                            }
                            onBlur={() => handleMoneyBlur(level.id, 'minValueInput')}
                            placeholder={settingsHourlyRateLevelsCopy.minValuePlaceholder}
                          />
                          <Input
                            label={settingsHourlyRateLevelsCopy.maxValueColumn}
                            type="text"
                            inputMode="decimal"
                            value={level.maxValueInput}
                            error={rowErrors?.maxValueInput || rowErrors?.range}
                            onChange={(event) =>
                              updateLevelField(level.id, 'maxValueInput', normalizePtBrMoneyInput(event.target.value))
                            }
                            onBlur={() => handleMoneyBlur(level.id, 'maxValueInput')}
                            placeholder={settingsHourlyRateLevelsCopy.maxValuePlaceholder}
                          />
                        </div>

                        <div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${getHourlyRateLevelBadgeClassName(level.label)}`}
                          >
                            {level.label.trim() || settingsHourlyRateLevelsCopy.levelNamePlaceholder}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleMoveLevel(level.id, 'up')}
                            disabled={isBusy || levelIndex === 0}
                            aria-label={settingsHourlyRateLevelsCopy.moveUp}
                            title={settingsHourlyRateLevelsCopy.moveUp}
                          >
                            <ArrowUp size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleMoveLevel(level.id, 'down')}
                            disabled={isBusy || levelIndex === levels.length - 1}
                            aria-label={settingsHourlyRateLevelsCopy.moveDown}
                            title={settingsHourlyRateLevelsCopy.moveDown}
                          >
                            <ArrowDown size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleDeleteLevel(level.id)}
                            disabled={isBusy || deletingId === level.id}
                            className="ml-auto text-destructive hover:text-destructive"
                          >
                            <Trash2 size={16} />
                            {settingsHourlyRateLevelsCopy.deleteLevel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-xs text-muted-foreground">{settingsHourlyRateLevelsCopy.hint}</p>

            <div className="sticky bottom-3 z-10 rounded-xl border border-border bg-card/95 p-3 backdrop-blur-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">{settingsHourlyRateLevelsCopy.summaryTitle}</p>
                <Button type="submit" isLoading={saving} disabled={loading || hasFieldErrors || hasRangeOverlap}>
                  {settingsHourlyRateLevelsCopy.save}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}