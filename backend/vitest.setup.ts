// Ensure env validation passes in tests without a real database.
// The validation (400) tests never open a connection, so a dummy URL is fine.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.CORS_ORIGIN ||= "http://localhost:3000";

// Keep the suite hermetic: force the email transport into its safe-by-default
// "log" mode regardless of what's in a developer's local .env. Set before env.ts
// reads it (dotenv/config never overrides an already-present key), so a real
// RESEND_API_KEY can't make the tests hit the network or send real onboarding
// mail. Tests that need the real path override env.email.resendApiKey directly.
process.env.RESEND_API_KEY = "";
