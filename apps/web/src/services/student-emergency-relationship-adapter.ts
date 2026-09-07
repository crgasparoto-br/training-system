import { emergencyRelationshipOptions } from '../utils/studentPersonalInfo';

const FIELD_NAME = 'intakeForm.personalInfo.emergencyContactRelationship';
const DATALIST_ID = 'student-emergency-relationship-options';

/**
 * Adds native combobox suggestions to the existing relationship field without
 * restricting it to the predefined list. A legacy or custom relationship stays
 * valid because HTML datalist inputs always accept free text.
 */
export function installStudentEmergencyRelationshipAdapter(
  root: ParentNode = document
) {
  const input = root.querySelector<HTMLInputElement>(`input[name="${FIELD_NAME}"]`);
  if (!input) return () => undefined;

  const previousList = input.getAttribute('list');
  const previousPlaceholder = input.getAttribute('placeholder');
  const existingList = document.getElementById(DATALIST_ID);
  const datalist = existingList ?? document.createElement('datalist');
  const createdList = !existingList;

  if (createdList) {
    datalist.id = DATALIST_ID;
    emergencyRelationshipOptions.forEach((relationship) => {
      const option = document.createElement('option');
      option.value = relationship;
      datalist.appendChild(option);
    });
    document.body.appendChild(datalist);
  }

  input.setAttribute('list', DATALIST_ID);
  input.setAttribute('placeholder', 'Selecione ou digite outra relação');

  return () => {
    if (previousList === null) input.removeAttribute('list');
    else input.setAttribute('list', previousList);

    if (previousPlaceholder === null) input.removeAttribute('placeholder');
    else input.setAttribute('placeholder', previousPlaceholder);

    if (createdList) datalist.remove();
  };
}
