/** Egységtesztek: gyorsak, adatbázis és hálózat nélkül. */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts', '!**/dto/**'],
  coverageDirectory: '../coverage/unit',
};
