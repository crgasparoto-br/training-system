import { describe, expect, it } from 'vitest';
import { adipometryRevisionStatusLabel } from './AdipometryViewSections';

describe('adipometryRevisionStatusLabel', () => {
  it.each([
    ['DRAFT', 'Rascunho'],
    ['FINALIZED', 'Concluída'],
    ['SUPERSEDED', 'Substituída'],
    ['CANCELLED', 'Cancelada'],
    ['VOIDED', 'Invalidada'],
  ] as const)('traduz %s sem colapsar estados distintos', (status, label) => {
    expect(adipometryRevisionStatusLabel(status)).toBe(label);
  });
});
