import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStudentEmergencyRelationshipAdapter } from './student-emergency-relationship-adapter';

describe('student emergency relationship adapter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads an unmatched legacy value as Outra and preserves the exact text', () => {
    document.body.innerHTML = `
      <input
        name="intakeForm.personalInfo.emergencyContactRelationship"
        value="Vizinho de confiança"
      />
    `;

    const input = document.querySelector<HTMLInputElement>(
      'input[name="intakeForm.personalInfo.emergencyContactRelationship"]'
    )!;
    const uninstall = installStudentEmergencyRelationshipAdapter(document);
    const select = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.emergencyContactRelationship.selection"]'
    )!;
    const other = document.querySelector<HTMLInputElement>(
      '[data-student-emergency-relationship-other="true"]'
    )!;

    expect(select.value).toBe('Outra');
    expect(other.disabled).toBe(false);
    expect(other.hidden).toBe(false);
    expect(other.value).toBe('Vizinho de confiança');
    expect(input.value).toBe('Vizinho de confiança');

    uninstall();
    expect(input.value).toBe('Vizinho de confiança');
    expect(input.style.display).toBe('');
  });

  it('keeps free text disabled until Outra is selected and syncs the registered field', () => {
    document.body.innerHTML = `
      <input name="intakeForm.personalInfo.emergencyContactRelationship" value="Mãe" />
    `;

    const input = document.querySelector<HTMLInputElement>(
      'input[name="intakeForm.personalInfo.emergencyContactRelationship"]'
    )!;
    const onChange = vi.fn();
    input.addEventListener('change', onChange);
    installStudentEmergencyRelationshipAdapter(document);

    const select = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.emergencyContactRelationship.selection"]'
    )!;
    const other = document.querySelector<HTMLInputElement>(
      '[data-student-emergency-relationship-other="true"]'
    )!;

    expect(select.value).toBe('Mãe');
    expect(other.disabled).toBe(true);

    select.value = 'Outra';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(other.disabled).toBe(false);
    expect(input.value).toBe('');

    other.value = 'Responsável legal';
    other.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('Responsável legal');

    select.value = 'Pai';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(other.disabled).toBe(true);
    expect(input.value).toBe('Pai');
    expect(onChange).toHaveBeenCalled();
  });
});
