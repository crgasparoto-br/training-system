import type { HourlyRateLevel } from '@corrida/types';
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { Input } from '../../components/ui/Input';
import { getHourlyRateLevelBadgeClassName } from '../../utils/hourlyRateLevelTone';
import type { CollaboratorFormValues } from './collaborator-model';
import {
  collaboratorHourlyRateSections,
  formatCollaboratorRateInput,
  getCollaboratorHourlyRateLevelLabel,
} from './collaborator-hourly-rates';

function errorMessage(error: unknown) {
  return typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
    ? error.message
    : undefined;
}

export function CollaboratorHourlyRates({
  register,
  watch,
  setValue,
  errors,
  levels,
  disabled,
}: {
  register: UseFormRegister<CollaboratorFormValues>;
  watch: UseFormWatch<CollaboratorFormValues>;
  setValue: UseFormSetValue<CollaboratorFormValues>;
  errors: FieldErrors<CollaboratorFormValues>;
  levels: HourlyRateLevel[];
  disabled: boolean;
}) {
  const values = watch('hourlyRates');

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-px bg-border">
        <div className="bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frente</div>
        <div className="bg-muted px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor/hora</div>
        <div className="bg-muted px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nível</div>

        {collaboratorHourlyRateSections.map((section) => {
          const fieldName = `hourlyRates.${section.key}` as const;
          const field = register(fieldName);
          const levelLabel = getCollaboratorHourlyRateLevelLabel(values?.[section.key], levels);
          return (
            <div key={section.key} className="contents">
              <div className="flex items-center bg-card px-4 py-4 text-sm font-medium text-foreground">
                {section.label}
              </div>
              <div className="bg-card px-3 py-3">
                <Input
                  aria-label={`Valor/hora ${section.label.toLowerCase()}`}
                  inputMode="decimal"
                  placeholder="0,00"
                  disabled={disabled}
                  {...field}
                  onBlur={(event) => {
                    field.onBlur(event);
                    setValue(fieldName, formatCollaboratorRateInput(event.target.value), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                  error={errorMessage(errors.hourlyRates?.[section.key])}
                />
              </div>
              <div className="flex items-center justify-center bg-card px-3 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${getHourlyRateLevelBadgeClassName(levelLabel)}`}
                >
                  {levelLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
