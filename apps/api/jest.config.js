export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // A suíte de integração abre clientes Prisma por arquivo. No CI com banco real,
  // serializar os arquivos evita esgotar max_connections sem reduzir a cobertura;
  // os testes unitários continuam usando o paralelismo padrão fora desse modo.
  maxWorkers: process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? 1 : undefined,
  testTimeout: process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? 15_000 : 5_000,
  moduleNameMapper: {
    '^\.\./\.\./bootstrap-env\.js$': '<rootDir>/tests/bootstrap-env.mock.ts',
    '^@corrida/types$': '<rootDir>/../../packages/types/index.ts',
    '^@corrida/utils$': '<rootDir>/../../packages/utils/index.ts',
    // Remove somente a extensão .js de imports relativos TypeScript. O lookahead
    // exclui explicitamente dependências que terminam em .cjs ou .mjs.
    '^(\.{1,2}/)(?!.*\.[cm]js$)(.*)\.js$': '$1$2',
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
