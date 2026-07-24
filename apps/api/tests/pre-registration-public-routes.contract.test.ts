import type { Server } from 'node:http';
import express from 'express';
import { preRegistrationPublicEntryRoutes } from '../src/modules/pre-registration-public/index.js';
import { parsePreRegistrationSaveStep } from '../src/modules/pre-registration-public/pre-registration-public.routes.js';

describe('public pre-registration route contracts', () => {
  const app = express();
  app.use('/api/v1', preRegistrationPublicEntryRoutes);
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Não foi possível iniciar o servidor de teste.');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function postRegistration(body: Record<string, unknown>) {
    const response = await fetch(
      `${baseUrl}/api/v1/pre-cadastro/contract-test-token/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return {
      status: response.status,
      body: await response.json() as { error?: string },
    };
  }

  it('reuses the shared account policy before creating an invited account', async () => {
    const response = await postRegistration({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
      role: 'STUDENT',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Email invalido|Nome deve ter|Senha deve ter/);
  });

  it('rejects unknown fields instead of allowing account mass assignment', async () => {
    const response = await postRegistration({
      name: 'Pessoa Teste',
      email: 'pessoa@example.com',
      password: 'senha-segura',
      role: 'STUDENT',
      isActive: true,
      type: 'professor',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Unrecognized key|não reconhecid/i);
  });
  it('accepts only the fields owned by the selected step', () => {
    expect(
      parsePreRegistrationSaveStep({
        expectedVersion: 1,
        step: 'CONTACT',
        data: { phone: '15999990000', email: 'contato@example.com' },
      })
    ).toEqual({
      expectedVersion: 1,
      step: 'CONTACT',
      data: { phone: '15999990000', email: 'contato@example.com' },
    });

    expect(() =>
      parsePreRegistrationSaveStep({
        expectedVersion: 1,
        step: 'CONTACT',
        data: { phone: '15999990000', cpf: '52998224725' },
      })
    ).toThrow(/Unrecognized key|não reconhecid/i);
  });

  it('rejects a privacy payload that attempts to mutate identity data', () => {
    expect(() =>
      parsePreRegistrationSaveStep({
        expectedVersion: 1,
        step: 'PRIVACY',
        data: { name: 'Mutação indevida' },
      })
    ).toThrow(/Unrecognized key|não reconhecid/i);
  });

});