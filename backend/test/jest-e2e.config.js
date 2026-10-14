/**
 * Integrációs tesztek: valódi NestJS alkalmazás + valódi PostgreSQL
 * (külön tesztadatbázis, lásd test/setup/global-setup.ts).
 * Sorosan futnak (--runInBand), mert közös adatbázist használnak.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'e2e',
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  testTimeout: 30000,
};
