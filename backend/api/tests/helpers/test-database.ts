export interface TestDatabaseConfig {
  migrationsDirectory: string;
  url: string;
}

export function readTestDatabaseConfig(): TestDatabaseConfig {
  return {
    migrationsDirectory: "backend/api/db/migrations",
    url: process.env.CMS_TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5434/cmsfleet_test"
  };
}
