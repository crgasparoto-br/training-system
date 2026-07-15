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
let confirmationVersion = 0;
let consumedConfirmationVersion = 0;

export function getContractReplacementState() {
  return latestState;
}

export function publishContractReplacementState(state: ContractReplacementState) {
  const isNewConfirmation =
    state.required &&
    state.confirmed &&
    (!latestState.confirmed ||
      latestState.activeContractId !== state.activeContractId ||
      latestState.selectedContractId !== state.selectedContractId);

  latestState = state;
  if (isNewConfirmation) confirmationVersion += 1;
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<ContractReplacementState>(CONTRACT_REPLACEMENT_STATE_EVENT, {
      detail: state,
    })
  );
}

export function consumeConfirmedContractReplacementBypass() {
  if (!latestState.required || !latestState.confirmed) return false;
  if (consumedConfirmationVersion === confirmationVersion) return false;

  consumedConfirmationVersion = confirmationVersion;
  return true;
}

export function requestContractReplacementConfirmation() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONTRACT_REPLACEMENT_CONFIRM_REQUEST_EVENT));
}
