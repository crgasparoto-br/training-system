import express from 'express';

const request = require('supertest');
const mockSignPublicContract = jest.fn();

jest.mock('../src/modules/student-contracts/student-contract-lifecycle.service', () => ({
  studentContractLifecycleService: {
    signPublicContract: mockSignPublicContract,
  },
}));

const router = require('../src/modules/contracts/contract-lifecycle.routes').default;

describe('contract lifecycle routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', router);

  beforeEach(() => jest.clearAllMocks());

  it('routes the canonical public signature endpoint through the transactional lifecycle', async () => {
    mockSignPublicContract.mockResolvedValue({
      signature: { id: 'signature-1' },
      activation: {
        effectiveAt: '2026-08-01T12:00:00.000Z',
        scheduled: true,
        studentContractStatus: 'pending_signature',
      },
    });

    const response = await request(app)
      .post('/contracts/public/public-token/sign')
      .send({
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
        signerEmail: 'aluno@example.com',
      });

    expect(response.status).toBe(200);
    expect(mockSignPublicContract).toHaveBeenCalledWith(
      'public-token',
      expect.objectContaining({ signerName: 'Aluno Teste' }),
      expect.objectContaining({ ipAddress: expect.any(String) })
    );
    expect(response.body.data.activation).toEqual(
      expect.objectContaining({ scheduled: true })
    );
  });
});
