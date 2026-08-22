import { repairUtf8Mojibake, sendError } from '@corrida/utils';

describe('API error encoding', () => {
  it.each([
    ['CPF invÃ¡lido', 'CPF inválido'],
    ['CNPJ invÃ¡lido', 'CNPJ inválido'],
    ['Contrato nÃ£o encontrado', 'Contrato não encontrado'],
    ['Documento jÃ¡ estÃ¡ registrado', 'Documento já está registrado'],
    ['Nenhum contrato disponÃ­vel', 'Nenhum contrato disponível'],
  ])('normaliza mojibake UTF-8: %s', (input, expected) => {
    expect(repairUtf8Mojibake(input)).toBe(expected);
  });

  it.each([
    'CPF inválido',
    'Contrato não encontrado',
    'Documento já está registrado',
    'Mensagem sem acentuação',
  ])('preserva texto já correto: %s', (input) => {
    expect(repairUtf8Mojibake(input)).toBe(input);
  });

  it('normaliza a mensagem antes de enviá-la pela resposta HTTP', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const response = { status } as any;

    sendError(response, 'CPF invÃ¡lido', 400);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'CPF inválido',
      })
    );
  });
});
