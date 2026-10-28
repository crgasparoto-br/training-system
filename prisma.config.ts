// The API schema and migration chain are the repository's operational source
// of truth. The root prisma/schema.prisma is a historical domain snapshot and
// must not be selected implicitly by a root Prisma CLI invocation.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "apps/api/prisma/schema.prisma",
  migrations: {
    path: "apps/api/prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
