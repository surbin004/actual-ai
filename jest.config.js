module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Updated to match your single app.ts file structure
  collectCoverageFrom: ['app.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
