import { emergencyRelationshipOptions } from '../utils/studentPersonalInfo';

const FIELD_NAME = 'intakeForm.personalInfo.emergencyContactRelationship';
const OTHER_RELATIONSHIP = 'Outra';

const dispatchFieldChange = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

/**
 * Adapts the existing React-hook-form field to the controlled interaction
 * required by the administrative screen: predefined relationship combobox and
 * a free-text field enabled only after selecting "Outra". The original input
 * remains the registered form field and receives the exact selected/custom
 * value through native bubbling events.
 */
export function installStudentEmergencyRelationshipAdapter(
  root: ParentNode = document
) {
  const input = root.querySelector<HTMLInputElement>(`input[name="${FIELD_NAME}"]`);
  if (!input) {
    if (typeof MutationObserver === 'undefined') return () => undefined;

    let uninstallMounted: () => void = () => undefined;
    const observer = new MutationObserver(() => {
      const mountedInput = root.querySelector<HTMLInputElement>(
        `input[name="${FIELD_NAME}"]`
      );
      if (!mountedInput) return;

      observer.disconnect();
      uninstallMounted = installStudentEmergencyRelationshipAdapter(root);
    });
    const observeTarget = root instanceof Node ? root : document.documentElement;
    observer.observe(observeTarget, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      uninstallMounted();
    };
  }

  const previousStyle = input.getAttribute('style');
  const previousAriaHidden = input.getAttribute('aria-hidden');
  const previousTabIndex = input.getAttribute('tabindex');
  const previousValueDescriptor = Object.getOwnPropertyDescriptor(input, 'value');
  const inheritedValueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  );
  const activeValueDescriptor = previousValueDescriptor ?? inheritedValueDescriptor;
  const predefined = emergencyRelationshipOptions.filter(
    (relationship) => relationship !== OTHER_RELATIONSHIP
  );

  const container = document.createElement('div');
  container.className = 'space-y-3';
  container.dataset.studentEmergencyRelationshipAdapter = 'true';

  const select = document.createElement('select');
  select.className = input.className;
  select.name = `${FIELD_NAME}.selection`;
  select.setAttribute('aria-label', 'Relação com o contato de emergência');

  const notInformed = document.createElement('option');
  notInformed.value = '';
  notInformed.textContent = 'Não informado';
  select.appendChild(notInformed);

  emergencyRelationshipOptions.forEach((relationship) => {
    const option = document.createElement('option');
    option.value = relationship;
    option.textContent = relationship;
    select.appendChild(option);
  });

  const otherInput = document.createElement('input');
  otherInput.type = 'text';
  otherInput.className = input.className;
  otherInput.placeholder = 'Informe a relação com o contato de emergência';
  otherInput.setAttribute('aria-label', 'Outra relação com o contato de emergência');
  otherInput.dataset.studentEmergencyRelationshipOther = 'true';

  const showOther = (show: boolean) => {
    otherInput.hidden = !show;
    otherInput.disabled = !show;
  };

  const syncControlsFromRegisteredValue = (rawValue: string) => {
    const value = rawValue.trim();
    const isCustom = Boolean(value && !predefined.includes(value as never));

    if (isCustom) {
      select.value = OTHER_RELATIONSHIP;
      otherInput.value = value;
      showOther(true);
      return;
    }

    select.value = value;
    otherInput.value = '';
    showOther(false);
  };

  syncControlsFromRegisteredValue(input.value);

  let interceptsProgrammaticValue = false;
  if (
    activeValueDescriptor?.get &&
    activeValueDescriptor.set &&
    activeValueDescriptor.configurable !== false
  ) {
    Object.defineProperty(input, 'value', {
      configurable: true,
      enumerable: activeValueDescriptor.enumerable,
      get() {
        return activeValueDescriptor.get?.call(input);
      },
      set(value: string) {
        activeValueDescriptor.set?.call(input, value);
        syncControlsFromRegisteredValue(String(value));
      },
    });
    interceptsProgrammaticValue = true;
  }

  select.addEventListener('change', () => {
    if (select.value === OTHER_RELATIONSHIP) {
      showOther(true);
      dispatchFieldChange(input, otherInput.value.trim());
      otherInput.focus();
      return;
    }

    showOther(false);
    dispatchFieldChange(input, select.value);
  });

  otherInput.addEventListener('input', () => {
    if (select.value === OTHER_RELATIONSHIP) {
      dispatchFieldChange(input, otherInput.value);
    }
  });

  input.style.display = 'none';
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.insertAdjacentElement('afterend', container);
  container.append(select, otherInput);

  return () => {
    container.remove();

    if (interceptsProgrammaticValue) {
      if (previousValueDescriptor) {
        Object.defineProperty(input, 'value', previousValueDescriptor);
      } else {
        Reflect.deleteProperty(input, 'value');
      }
    }

    if (previousStyle === null) input.removeAttribute('style');
    else input.setAttribute('style', previousStyle);

    if (previousAriaHidden === null) input.removeAttribute('aria-hidden');
    else input.setAttribute('aria-hidden', previousAriaHidden);

    if (previousTabIndex === null) input.removeAttribute('tabindex');
    else input.setAttribute('tabindex', previousTabIndex);
  };
}
