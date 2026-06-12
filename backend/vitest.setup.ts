// Ensure env validation passes in tests without a real database.
// The validation (400) tests never open a connection, so a dummy URL is fine.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.CORS_ORIGIN ||= "http://localhost:3000";
