import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
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

const emptyStateTitle = 'Nenhum nível cadastrado';
const emptyStateDescription = 'Crie o primeiro nível para definir as faixas de classificação por valor/hora.';
const emptyStateAction = 'Criar primeiro nível';
const desktopRangeColumnLabel = 'Faixa de valor/hora';

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

function getLevelDisplayName(level: EditableLevel, levelIndex: number) {
  return level.label.trim() || `nível ${levelIndex + 1}`;
}

function getFieldAriaLabel(fieldLabel: string, level: EditableLevel, levelIndex: number) {
  return `${fieldLabel} de ${getLevelDisplayName(level, levelIndex)}`;
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

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
      <div>
        <p className="font-semibold text-foreground">{emptyStateTitle}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{emptyStateDescription}</p>
      </div>
      <Button type="button" onClick={handleCreateLevel} disabled={isBusy}>
        <Plus size={16} />
        {emptyStateAction}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-foreground">{settingsHourlyRateLevelsCopy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{settingsHourlyRateLevelsCopy.description}</p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Button type="button" className="w-full" onClick={handleCreateLevel} disabled={isBusy}>
            <Plus size={16} />
            {settingsHourlyRateLevelsCopy.addLevel}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={loadLevels} disabled={isBusy}>
            <RefreshCw size={16} />
            {settingsHourlyRateLevelsCopy.refresh}
          </Button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {hasRangeOverlap && !error ? (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {settingsHourlyRateLevelsCopy.overlapWarning}
        </div>
      ) : null}

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

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{settingsHourlyRateLevelsCopy.cardTitle}</CardTitle>
              <CardDescription>{settingsHourlyRateLevelsCopy.cardDescription}</CardDescription>
            </div>
            {!loading && levels.length > 0 ? (
              <span className="inline-flex w-fit rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                {levels.length} {levels.length === 1 ? 'nível' : 'níveis'}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
              <table className="min-w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[148px]" />
                  <col className="w-[28%]" />
                  <col />
                  <col className="w-[132px]" />
                  <col className="w-[76px]" />
                </colgroup>
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">{settingsHourlyRateLevelsCopy.orderLabel}</th>
                    <th className="px-4 py-3">{settingsHourlyRateLevelsCopy.levelNameColumn}</th>
                    <th className="px-4 py-3">{desktopRangeColumnLabel}</th>
                    <th className="px-4 py-3">{settingsHourlyRateLevelsCopy.statusColumn}</th>
                    <th className="px-4 py-3 text-right">{settingsHourlyRateLevelsCopy.actionsColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        {settingsHourlyRateLevelsCopy.loadingLevels}
                      </td>
                    </tr>
                  ) : levels.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4">
                        {emptyState}
                      </td>
                    </tr>
                  ) : (
                    levels.map((level, levelIndex) => {
                      const isConfigured =
                        parseValue(level.minValueInput) !== null && parseValue(level.maxValueInput) !== null;
                      const rowErrors = levelErrors[levelIndex];
                      const levelDisplayName = getLevelDisplayName(level, levelIndex);

                      return (
                        <tr key={level.id} className="border-t border-border align-middle transition-colors hover:bg-muted/20">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-muted px-2 text-sm font-semibold text-foreground">
                                {levelIndex + 1}
                              </span>
                              <div className="flex rounded-lg border border-border bg-card p-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleMoveLevel(level.id, 'up')}
                                  disabled={isBusy || levelIndex === 0}
                                  aria-label={`${settingsHourlyRateLevelsCopy.moveUp} ${levelDisplayName}`}
                                  title={settingsHourlyRateLevelsCopy.moveUp}
                                >
                                  <ArrowUp size={15} />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleMoveLevel(level.id, 'down')}
                                  disabled={isBusy || levelIndex === levels.length - 1}
                                  aria-label={`${settingsHourlyRateLevelsCopy.moveDown} ${levelDisplayName}`}
                                  title={settingsHourlyRateLevelsCopy.moveDown}
                                >
                                  <ArrowDown size={15} />
                                </Button>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Input
                              label=""
                              aria-label={getFieldAriaLabel(settingsHourlyRateLevelsCopy.levelNameColumn, level, levelIndex)}
                              value={level.label}
                              error={rowErrors?.label}
                              onChange={(event) => updateLevelField(level.id, 'label', event.target.value)}
                              placeholder={settingsHourlyRateLevelsCopy.levelNamePlaceholder}
                            />
                            <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-2.5 py-2">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {settingsHourlyRateLevelsCopy.levelPreviewLabel}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${getHourlyRateLevelBadgeClassName(level.label)}`}
                              >
                                {level.label.trim() || settingsHourlyRateLevelsCopy.levelNamePlaceholder}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
                              <Input
                                label={settingsHourlyRateLevelsCopy.minValueColumn}
                                aria-label={getFieldAriaLabel(settingsHourlyRateLevelsCopy.minValueColumn, level, levelIndex)}
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
                              <span className="mt-10 text-xs font-medium uppercase tracking-wide text-muted-foreground">até</span>
                              <Input
                                label={settingsHourlyRateLevelsCopy.maxValueColumn}
                                aria-label={getFieldAriaLabel(settingsHourlyRateLevelsCopy.maxValueColumn, level, levelIndex)}
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
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
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
                          <td className="px-4 py-4 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteLevel(level.id)}
                              disabled={isBusy || deletingId === level.id}
                              aria-label={`${settingsHourlyRateLevelsCopy.deleteLevel} ${levelDisplayName}`}
                              title={settingsHourlyRateLevelsCopy.deleteLevel}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 xl:hidden">
              {loading ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  {settingsHourlyRateLevelsCopy.loadingLevels}
                </div>
              ) : levels.length === 0 ? (
                emptyState
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

                        <div className="grid gap-3 sm:grid-cols-2">
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

                        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-2.5 py-2">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {settingsHourlyRateLevelsCopy.levelPreviewLabel}
                          </span>
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

            {levels.length > 0 ? <p className="text-xs text-muted-foreground">{settingsHourlyRateLevelsCopy.hint}</p> : null}

            <div className="sticky bottom-3 z-10 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">{settingsHourlyRateLevelsCopy.summaryTitle}</p>
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  isLoading={saving}
                  disabled={loading || levels.length === 0 || hasFieldErrors || hasRangeOverlap}
                >
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