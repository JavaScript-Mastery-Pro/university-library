import { defineConfig } from "drizzle-kit";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: ".env" });

export default defineConfig({
  schema: "./database/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
