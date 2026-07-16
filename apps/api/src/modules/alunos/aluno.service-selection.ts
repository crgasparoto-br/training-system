export interface StudentInterestServiceCandidate {
  id: string;
  isActive: boolean;
  parentServiceId?: string | null;
}

/**
 * Um vínculo já persistido pode permanecer legível mesmo após a inativação ou
 * durante o período de compatibilidade legado. Qualquer troca ou novo vínculo
 * continua restrito a serviços principais ativos.
 */
export function assertStudentInterestServiceSelectable(
  service: StudentInterestServiceCandidate,
  currentServiceId?: string | null
) {
  if (currentServiceId && service.id === currentServiceId) return;

  if (!service.isActive) {
    throw new Error('Serviço selecionado está inativo');
  }

  if (service.parentServiceId) {
    throw new Error('Selecione um serviço principal no campo Serviço de Interesse');
  }
}
