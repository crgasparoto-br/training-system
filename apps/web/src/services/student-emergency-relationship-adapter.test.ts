import { afterEach, describe, expect, it } from 'vitest';
import { installStudentEmergencyRelationshipAdapter } from './student-emergency-relationship-adapter';

describe('student emergency relationship adapter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('offers suggestions while preserving a custom relationship value', () => {
    document.body.innerHTML = `
      <input
        name="intakeForm.personalInfo.emergencyContactRelationship"
        value="Vizinho"
      />
    `;

    const input = document.querySelector<HTMLInputElement>(
      'input[name="intakeForm.personalInfo.emergencyContactRelationship"]'
    )!;
    const uninstall = installStudentEmergencyRelationshipAdapter(document);

    expect(input.value).toBe('Vizinho');
    expect(input.getAttribute('list')).toBe('student-emergency-relationship-options');
    expect(
      document.querySelectorAll('#student-emergency-relationship-options option').length
    ).toBeGreaterThan(5);

    uninstall();
    expect(input.value).toBe('Vizinho');
    expect(input.hasAttribute('list')).toBe(false);
  });
});
