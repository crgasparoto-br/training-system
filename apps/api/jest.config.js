export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // A suíte de integração abre clientes Prisma por arquivo. No CI com banco real,
  // limitar workers evita esgotar max_connections sem reduzir o paralelismo dos
  // testes unitários executados fora desse modo.
  maxWorkers: process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? 2 : undefined,
  moduleNameMapper: {
    '^\.\./\.\./bootstrap-env\.js$': '<rootDir>/tests/bootstrap-env.mock.ts',
     '^@corrida/types$': '<rootDir>/../../packages/types/index.ts',
     '^@corrida/utils$': '<rootDir>/../../packages/utils/index.ts',
    // Remove a extensão dos imports TypeScript escritos como .js sem capturar
    // dependências CommonJS/ESM que terminam em .cjs ou .mjs.
    '^(\.{1,2}/.*?)(?<!\.[cm])\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
