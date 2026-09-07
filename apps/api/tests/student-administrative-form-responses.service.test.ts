import { mergeStudentAdministrativeFormResponses } from '../src/modules/alunos/student-administrative-form-responses.service';

describe('administrative student form responses', () => {
  it('merges administrative sections without accepting legacy PAR-Q writes', () => {
    expect(
      mergeStudentAdministrativeFormResponses(
        {
          identification: { cpf: '111' },
          financial: { currentService: 'Contrato atual', paymentDay: '5' },
        },
        {
          identification: { cpf: '222', emergencyContactRelationship: 'Vizinho' },
          financial: { currentService: 'valor do navegador', monthlyValue: '300,00' },
          parqResponses: { q1: true },
        }
      )
    ).toEqual({
      identification: { cpf: '222', emergencyContactRelationship: 'Vizinho' },
      financial: {
        currentService: 'Contrato atual',
        paymentDay: '5',
        monthlyValue: '300,00',
      },
    });
  });

  it('does not create a client-owned current service when none is persisted', () => {
    expect(
      mergeStudentAdministrativeFormResponses({}, {
        financial: { currentService: 'não confiável', paymentDay: '10' },
      })
    ).toEqual({ financial: { paymentDay: '10' } });
  });
});
