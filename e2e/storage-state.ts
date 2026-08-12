import path from "node:path";

// Where e2e/auth.setup.ts saves each role's logged-in storageState (session
// cookies) for other specs to load via `test.use({ storageState })` instead
// of driving a UI login in every test. Gitignored (see .gitignore) — these
// files contain live session cookies for the test database.
export const AGENT_STORAGE_STATE = path.join(__dirname, ".auth", "agent.json");
export const ADMIN_STORAGE_STATE = path.join(__dirname, ".auth", "admin.json");
