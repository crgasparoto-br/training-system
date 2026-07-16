export const CONTRACT_REPLACEMENT_STATE_EVENT =
  'student-contract-replacement:state-changed';
export const CONTRACT_REPLACEMENT_CONFIRM_REQUEST_EVENT =
  'student-contract-replacement:confirm-requested';

export type ContractReplacementState = {
  activeContractId: string;
  selectedContractId: string;
  required: boolean;
  confirmed: boolean;
};

let latestState: ContractReplacementState = {
  activeContractId: '',
  selectedContractId: '',
  required: false,
  confirmed: false,
};

export function getContractReplacementState() {
  return latestState;
}

export function publishContractReplacementState(state: ContractReplacementState) {
  latestState = state;
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<ContractReplacementState>(CONTRACT_REPLACEMENT_STATE_EVENT, {
      detail: state,
    })
  );
}

export function requestContractReplacementConfirmation() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONTRACT_REPLACEMENT_CONFIRM_REQUEST_EVENT));
}
