export interface AvailableStudentContractFilters {
  alunoId?: string;
  serviceId?: string;
  onlyUnlinked?: boolean;
  status?: string[];
}

/**
 * Builds the filters used by the contract picker.
 *
 * When editing an existing student, alunoId is the source of truth because
 * Aluno.serviceId identifies the base service while Contract.serviceId may
 * identify a financial child offer. Sending both filters would hide valid
 * contracts already generated for the student.
 */
export const buildAvailableStudentContractQuery = (
  filters?: AvailableStudentContractFilters
) => {
  const params = new URLSearchParams();

  if (filters?.alunoId) {
    params.set('alunoId', filters.alunoId);
  } else if (filters?.serviceId) {
    params.set('serviceId', filters.serviceId);
  }

  if (filters?.onlyUnlinked !== undefined) {
    params.set('onlyUnlinked', String(filters.onlyUnlinked));
  }

  if (filters?.status?.length) {
    params.set('status', filters.status.join(','));
  }

  return params.toString();
};
