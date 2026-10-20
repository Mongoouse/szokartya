/** Egységtesztek: gyorsak, adatbázis és hálózat nélkül. */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/prisma', '<rootDir>/scripts'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/**/dto/**'],
  coverageDirectory: 'coverage/unit',
};
