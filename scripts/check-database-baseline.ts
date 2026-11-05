// Local-only check that supabase/baseline.sql matches the migration chain (AGENTS.md, Supabase
// Migrations). It builds two disposable databases from the local stack's Postgres image, one from
// supabase/migrations and one from the baseline, and compares:
//   - schema and privileges, from a normalised schema-only dump
//   - realtime publication membership
//   - bootstrap records: the platform_settings row, storage buckets, and pg_cron jobs
//   - the baseline's applied-migration list against the migration files
// It also proves that a failed baseline installation leaves nothing behind. It never writes the
// baseline: drift is reported for a person to fix in the affected definition.

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = new URL("..", import.meta.url).pathname;
const migrationsDirectory = join(projectRoot, "supabase", "migrations");
const baselinePath = join(projectRoot, "supabase", "baseline.sql");
const databasePassword = "postgres";

type MigrationFile = { version: string; name: string; path: string };

function runDocker(args: string[], input?: string): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function readProjectId(): string {
  const config = readFileSync(join(projectRoot, "supabase", "config.toml"), "utf8");
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(config);
  if (!match?.[1]) throw new Error("supabase/config.toml has no project_id.");
  return match[1];
}

function readLocalPostgresImage(): string {
  const container = `supabase_db_${readProjectId()}`;
  const result = spawnSync("docker", ["inspect", container, "--format", "{{.Config.Image}}"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`The local database container ${container} is not running. Run \`supabase start\` first.`);
  }
  return result.stdout.trim();
}

function readMigrationFiles(): MigrationFile[] {
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(file);
      if (!match?.[1] || !match[2]) throw new Error(`Migration file name ${file} is not <version>_<name>.sql.`);
      return { version: match[1], name: match[2], path: join(migrationsDirectory, file) };
    });
}

class DisposableDatabase {
  readonly container: string;

  constructor(label: string) {
    this.container = `groombox-baseline-check-${label}-${randomBytes(3).toString("hex")}`;
  }

  start(image: string): void {
    runDocker([
      "run", "--detach", "--rm", "--name", this.container,
      "--env", `POSTGRES_PASSWORD=${databasePassword}`,
      "--env", "POSTGRES_USER=supabase_admin",
      "--env", "POSTGRES_DB=postgres",
      image,
    ]);
  }

  async waitUntilReady(): Promise<void> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const probe = spawnSync(
        "docker",
        ["exec", "--env", `PGPASSWORD=${databasePassword}`, this.container,
          "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-Atc", "select 1"],
        { encoding: "utf8" },
      );
      if (probe.status === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`${this.container} did not become ready.`);
  }

  // Runs SQL as the postgres role, as the Supabase CLI does for migrations.
  runSql(sql: string, options: { singleTransaction: boolean }): { ok: boolean; output: string } {
    const args = [
      "exec", "--interactive", "--env", `PGPASSWORD=${databasePassword}`, this.container,
      "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    ];
    if (options.singleTransaction) args.push("--single-transaction");
    const result = spawnSync("docker", args, { encoding: "utf8", input: sql, maxBuffer: 64 * 1024 * 1024 });
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
  }

  query(sql: string): string {
    return runDocker([
      "exec", "--env", `PGPASSWORD=${databasePassword}`, this.container,
      "psql", "-h", "127.0.0.1", "-U", "supabase_admin", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1",
      "-c", sql,
    ]).trim();
  }

  // Dumped as the superuser, because the postgres role cannot lock every Supabase-owned table.
  dumpSchema(): string {
    return runDocker([
      "exec", "--env", `PGPASSWORD=${databasePassword}`, this.container,
      "pg_dump", "-h", "127.0.0.1", "-U", "supabase_admin", "-d", "postgres",
      "--schema-only", "--exclude-schema=supabase_migrations",
    ]);
  }

  stop(): void {
    spawnSync("docker", ["rm", "--force", this.container], { encoding: "utf8" });
  }
}

// Removes comments and session-specific lines, and sorts the column and constraint lines inside
// each CREATE TABLE, because a baseline keeps columns in their table while migrations append them.
function normaliseDump(dump: string): string {
  const output: string[] = [];
  let tableLines: string[] | null = null;
  for (const line of dump.split("\n")) {
    if (line.startsWith("--") || line.startsWith("\\restrict") || line.startsWith("\\unrestrict") || line.trim() === "") {
      continue;
    }
    if (tableLines) {
      if (line.startsWith(")")) {
        output.push(...tableLines.map((entry) => entry.replace(/,$/, "")).sort());
        output.push(line);
        tableLines = null;
      } else {
        tableLines.push(line);
      }
      continue;
    }
    output.push(line);
    if (/^CREATE (UNLOGGED )?TABLE .*\($/.test(line)) tableLines = [];
  }
  return `${output.join("\n")}\n`;
}

function readBootstrapRecords(database: DisposableDatabase): string {
  const sections = [
    database.query(
      "select coalesce(jsonb_agg(to_jsonb(s) - 'created_at' - 'updated_at'), '[]') from public.platform_settings s",
    ),
    database.query(
      "select coalesce(jsonb_agg(schemaname || '.' || tablename order by schemaname, tablename), '[]') " +
        "from pg_publication_tables where pubname = 'supabase_realtime'",
    ),
  ];
  // The storage service and pg_cron create these tables; the bare image has them only once used.
  if (database.query("select to_regclass('storage.buckets') is not null") === "t") {
    sections.push(
      database.query(
        "select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit, " +
          "'allowed_mime_types', allowed_mime_types) order by id), '[]') from storage.buckets",
      ),
    );
  }
  if (database.query("select to_regclass('cron.job') is not null") === "t") {
    sections.push(
      database.query(
        "select coalesce(jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule, 'command', command) " +
          "order by jobname), '[]') from cron.job",
      ),
    );
  }
  return `${sections.join("\n")}\n`;
}

function describeDifference(label: string, expected: string, actual: string, workDirectory: string): string {
  const expectedPath = join(workDirectory, `${label}.migrations.txt`);
  const actualPath = join(workDirectory, `${label}.baseline.txt`);
  writeFileSync(expectedPath, expected);
  writeFileSync(actualPath, actual);
  const diff = spawnSync("diff", ["-u", expectedPath, actualPath], { encoding: "utf8" });
  return diff.stdout;
}

async function main(): Promise<void> {
  const image = readLocalPostgresImage();
  const migrations = readMigrationFiles();
  const baseline = readFileSync(baselinePath, "utf8");
  const workDirectory = mkdtempSync(join(tmpdir(), "groombox-baseline-check-"));
  const fromMigrations = new DisposableDatabase("migrations");
  const fromBaseline = new DisposableDatabase("baseline");
  const failures: string[] = [];

  try {
    console.log(`Starting disposable databases from ${image}`);
    fromMigrations.start(image);
    fromBaseline.start(image);
    await Promise.all([fromMigrations.waitUntilReady(), fromBaseline.waitUntilReady()]);

    for (const migration of migrations) {
      const applied = fromMigrations.runSql(readFileSync(migration.path, "utf8"), { singleTransaction: true });
      if (!applied.ok) throw new Error(`Migration ${migration.version}_${migration.name} failed:\n${applied.output}`);
    }
    console.log(`Applied ${migrations.length} migration(s).`);

    const forcedFailure = fromBaseline.runSql(`${baseline}\nselect 1 / 0;\n`, { singleTransaction: true });
    const leftovers = fromBaseline.query(
      "select (select count(*) from pg_namespace where nspname in ('private', 'supabase_migrations')) " +
        "+ (select count(*) from pg_class where relnamespace = 'public'::regnamespace) " +
        "+ (select count(*) from pg_type where typnamespace = 'public'::regnamespace) " +
        "+ (select count(*) from pg_publication_tables where pubname = 'supabase_realtime')",
    );
    if (forcedFailure.ok) failures.push("The forced failure after the baseline did not fail.");
    if (leftovers !== "0") failures.push(`A failed baseline installation left ${leftovers} object(s) behind.`);
    if (failures.length === 0) console.log("A failed baseline installation rolls back completely.");

    const installed = fromBaseline.runSql(baseline, { singleTransaction: true });
    if (!installed.ok) throw new Error(`The baseline failed to install:\n${installed.output}`);
    console.log("Installed the baseline.");

    const schemaDifference = describeDifference(
      "schema",
      normaliseDump(fromMigrations.dumpSchema()),
      normaliseDump(fromBaseline.dumpSchema()),
      workDirectory,
    );
    if (schemaDifference) failures.push(`Schema or privileges differ:\n${schemaDifference}`);

    const bootstrapDifference = describeDifference(
      "bootstrap",
      readBootstrapRecords(fromMigrations),
      readBootstrapRecords(fromBaseline),
      workDirectory,
    );
    if (bootstrapDifference) failures.push(`Bootstrap records or realtime membership differ:\n${bootstrapDifference}`);

    const expectedMigrationList = migrations.map((migration) => `${migration.version}|${migration.name}`).join("\n");
    const baselineMigrationList = fromBaseline.query(
      "select version || '|' || name from supabase_migrations.schema_migrations order by version",
    );
    if (expectedMigrationList !== baselineMigrationList) {
      failures.push(
        `The baseline's applied-migration list differs from supabase/migrations.\n` +
          `Expected:\n${expectedMigrationList}\nBaseline:\n${baselineMigrationList}`,
      );
    }
  } finally {
    fromMigrations.stop();
    fromBaseline.stop();
  }

  if (failures.length > 0) {
    console.error(`\nBaseline check failed (normalised files kept in ${workDirectory}):\n`);
    for (const failure of failures) console.error(`- ${failure}\n`);
    process.exit(1);
  }
  console.log("Baseline matches the migration chain: schema, privileges, bootstrap records, realtime, migration list.");
}

await main();
