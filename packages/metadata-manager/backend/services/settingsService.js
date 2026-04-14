import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

export async function getSetting(key) {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function setSetting(key, value) {
  return prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getAllSettings() {
  const settings = await prisma.setting.findMany();
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

export async function getMusicLibraryPath() {
  const dbPath = await getSetting("musicLibraryPath");
  return dbPath || process.env.MUSIC_LIBRARY_PATH || null;
}

export async function getInboxPath() {
  return (await getSetting("inboxPath")) || null;
}
