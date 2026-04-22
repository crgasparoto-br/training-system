import { useEffect, useState } from 'react';
import type { HourlyRateLevel, HourlyRateLevelCode } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { settingsHourlyRateLevelsCopy } from '../../i18n/ptBR';
import { hourlyRateLevelService } from '../../services/hourly-rate-level.service';

type FormState = Record<HourlyRateLevelCode, { minValue: string; maxValue: string }>;

const defaultFormState: FormState = {
  bronze: { minValue: '', maxValue: '' },
  silver: { minValue: '', maxValue: '' },
  gold: { minValue: '', maxValue: '' },
};

function getFormState(levels: HourlyRateLevel[]): FormState {
  return levels.reduce<FormState>((accumulator, level) => {
    accumulator[level.code] = {
      minValue: level.minValue?.toString() ?? '',
      maxValue: level.maxValue?.toString() ?? '',
    };
    return accumulator;
  }, { ...defaultFormState });
}

function parseValue(value: string) {
  const normalizedValue = value.trim().replace(',', '.');
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

export default function SettingsHourlyRateLevels() {
  const [levels, setLevels] = useState<HourlyRateLevel[]>([]);
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLevels = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await hourlyRateLevelService.list();
      setLevels(data);
      setForm(getFormState(data));
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
        levels.map((level) => ({
          code: level.code,
          minValue: parseValue(form[level.code].minValue),
          maxValue: parseValue(form[level.code].maxValue),
        }))
      );

      setLevels(updatedLevels);
      setForm(getFormState(updatedLevels));
    } catch (err: any) {
      setError(err?.response?.data?.error || settingsHourlyRateLevelsCopy.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{settingsHourlyRateLevelsCopy.title}</h1>
          <p className="text-sm text-muted-foreground">{settingsHourlyRateLevelsCopy.description}</p>
        </div>
        <Button type="button" variant="outline" onClick={loadLevels} disabled={loading || saving}>
          {settingsHourlyRateLevelsCopy.refresh}
        </Button>
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
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.levelColumn}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.minValueColumn}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.maxValueColumn}</th>
                    <th className="px-3 py-2">{settingsHourlyRateLevelsCopy.statusColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        Carregando níveis...
                      </td>
                    </tr>
                  ) : (
                    levels.map((level) => {
                      const isConfigured = !!form[level.code].minValue && !!form[level.code].maxValue;

                      return (
                        <tr key={level.id} className="border-b align-top">
                          <td className="px-3 py-3 font-medium text-foreground">{level.label}</td>
                          <td className="px-3 py-3">
                            <Input
                              label=""
                              type="number"
                              min="0"
                              step="0.01"
                              value={form[level.code].minValue}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  [level.code]: {
                                    ...current[level.code],
                                    minValue: event.target.value,
                                  },
                                }))
                              }
                              placeholder="0,00"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              label=""
                              type="number"
                              min="0"
                              step="0.01"
                              value={form[level.code].maxValue}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  [level.code]: {
                                    ...current[level.code],
                                    maxValue: event.target.value,
                                  },
                                }))
                              }
                              placeholder="0,00"
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