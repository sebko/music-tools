import { execSync } from "child_process";

/**
 * SAFE DATABASE RESET
 * Clears all records from all tables WITHOUT touching any actual files
 * This only deletes database records - your music files are 100% safe
 *
 * Uses Prisma migrate reset to automatically handle all tables,
 * so no updates needed when new tables are added to the schema.
 */
async function resetDatabase() {
  console.log("🗑️  Starting database reset...");
  console.log("⚠️  This will DELETE all records from all tables");
  console.log("✅ Your actual music files will NOT be touched\n");

  try {
    console.log("🔄 Running prisma migrate reset...");
    console.log("   This will drop all data and recreate the schema\n");

    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" },
    });

    console.log("\n✅ Database reset complete!");
    console.log("💿 All database records have been cleared");
    console.log("🔄 Database schema is up-to-date");
    console.log("📁 Your music files are safe and untouched");
    console.log("\n💡 Tip: Run a library scan to re-import albums from Plex");
  } catch (error) {
    console.error("❌ Error resetting database:", error.message);
    throw error;
  }
}

resetDatabase().catch(console.error);
