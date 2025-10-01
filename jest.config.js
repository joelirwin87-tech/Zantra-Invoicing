export default {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testMatch: ['**/tests/**/*.test.[jm]js'],
  moduleFileExtensions: ['js', 'mjs', 'json'],
  moduleNameMapper: {
    '\\.(css)$': '<rootDir>/tests/styleMock.mjs'
  }
};
