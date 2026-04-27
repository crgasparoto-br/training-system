import { useEffect, useState } from 'react';
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

export default function SettingsHourlyRateLevels() {
  const [levels, setLevels] = useState<EditableLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Button type="button" variant="outline" onClick={loadLevels} disabled={loading || saving || creating || !!deletingId}>
            {settingsHourlyRateLevelsCopy.refresh}
          </Button>
          <Button type="button" variant="secondary" onClick={handleCreateLevel} disabled={loading || saving || creating || !!deletingId}>
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

      <Card>
        <CardHeader>
          <CardTitle>{settingsHourlyRateLevelsCopy.cardTitle}</CardTitle>
          <CardDescription>{settingsHourlyRateLevelsCopy.cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
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
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        Carregando níveis...
                      </td>
                    </tr>
                  ) : (
                    levels.map((level) => {
                      const levelIndex = levels.findIndex((item) => item.id === level.id);
                      const isConfigured = !!level.minValueInput && !!level.maxValueInput;

                      return (
                        <tr key={level.id} className="border-b align-top">
                          <td className="px-3 py-3">
                            <Input
                              label=""
                              value={level.label}
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
                                disabled={saving || creating || !!deletingId || levelIndex === 0}
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
                                disabled={saving || creating || !!deletingId || levelIndex === levels.length - 1}
                                aria-label={settingsHourlyRateLevelsCopy.moveDown}
                                title={settingsHourlyRateLevelsCopy.moveDown}
                              >
                                <ArrowDown size={16} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleDeleteLevel(level.id)}
                                disabled={saving || creating || deletingId === level.id}
                              >
                                <Trash2 size={16} />
                                {settingsHourlyRateLevelsCopy.deleteLevel}
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

            <p className="text-xs text-muted-foreground">{settingsHourlyRateLevelsCopy.hint}</p>

            <div className="flex justify-end">
              <Button type="submit" isLoading={saving} disabled={loading}>
                {settingsHourlyRateLevelsCopy.save}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}