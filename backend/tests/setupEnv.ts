// Runs before each test file is imported, so config.ts sees test settings. CI never calls a paid API.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://set-per-test-file';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.LLM_PROVIDER = 'fake';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.REFUND_AGENT_LIMIT_INR = '2000';
