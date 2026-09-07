import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const planDetailsPath = join(process.cwd(), 'src/pages/PlanDetails.tsx');
const planDetailsSource = readFileSync(planDetailsPath, 'utf8');
const periodizationServicePath = join(process.cwd(), 'src/services/periodization.service.ts');
const periodizationServiceSource = readFileSync(periodizationServicePath, 'utf8');

describe('PlanDetails: sincronização da matriz canônica', () => {
  it('reconsulta a matriz quando uma mutação de periodização persistida é publicada', () => {
    expect(planDetailsSource).toContain('PERIODIZATION_MATRIX_UPDATED_EVENT');
    expect(planDetailsSource).toContain('shouldRefreshPeriodizationMatrix(id, matrix?.id, detail)');
    expect(planDetailsSource).toContain('void refreshPeriodizationMatrix(id);');
    expect(planDetailsSource).toContain(
      'window.addEventListener(PERIODIZATION_MATRIX_UPDATED_EVENT, handlePeriodizationMatrixUpdated)'
    );
  });

  it('também reconsulta ao voltar para Montagem semanal sem depender apenas do evento', () => {
    expect(planDetailsSource).toContain('const handleOpenAssemblyTab = () =>');
    expect(planDetailsSource).toContain('onClick={handleOpenAssemblyTab}');
  });

  it('publica a invalidação somente depois das mutações canônicas bem-sucedidas', () => {
    expect(periodizationServiceSource).toContain('notifyPeriodizationMatrixUpdated');
    expect(periodizationServiceSource).toMatch(
      /await api\.post\('\/periodization\/resisted',[\s\S]*notifyPeriodizationMatrixUpdated/
    );
    expect(periodizationServiceSource).toMatch(
      /await api\.post\('\/periodization\/cyclic',[\s\S]*notifyPeriodizationMatrixUpdated/
    );
    expect(periodizationServiceSource).toMatch(
      /await api\.post\('\/periodization\/nutrition',[\s\S]*notifyPeriodizationMatrixUpdated/
    );
  });
});
