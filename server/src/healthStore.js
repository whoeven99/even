const { CosmosClient } = require("@azure/cosmos");

const DOC_ID = "health-tracker";
const DOC_PK = "health-tracker";

let cosmosContainerPromise = null;

function getCosmosConfig() {
  return {
    endpoint: process.env.AZURE_COSMOS_ENDPOINT || "",
    key: process.env.AZURE_COSMOS_KEY || "",
    database: process.env.AZURE_COSMOS_DATABASE || "",
    container: process.env.AZURE_COSMOS_CONTAINER || "",
  };
}

async function getCosmosContainer() {
  if (cosmosContainerPromise) return cosmosContainerPromise;
  cosmosContainerPromise = (async () => {
    const cfg = getCosmosConfig();
    const ok = cfg.endpoint && cfg.key && cfg.database && cfg.container;
    if (!ok)
      throw new Error(
        "Cosmos 配置不完整：请检查 endpoint/key/database/container",
      );
    const client = new CosmosClient({ endpoint: cfg.endpoint, key: cfg.key });
    const database = client.database(cfg.database);
    await database.read();
    const container = database.container(cfg.container);
    await container.read();
    return container;
  })().catch((err) => {
    cosmosContainerPromise = null;
    throw err;
  });
  return cosmosContainerPromise;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeDate(value) {
  const date = String(value || "").trim();
  if (!date) throw new Error("记录缺少日期 date");
  return date.slice(0, 10);
}

function sanitizeBody(item) {
  const id = String(item?.id || "").trim();
  if (!id) throw new Error("体征记录缺少 id");
  return {
    id,
    date: sanitizeDate(item?.date),
    weightKg: num(item?.weightKg),
    bodyFatPct: num(item?.bodyFatPct),
    note: item?.note ? String(item.note).trim() : undefined,
  };
}

function sanitizeExercise(item) {
  const id = String(item?.id || "").trim();
  if (!id) throw new Error("运动记录缺少 id");
  return {
    id,
    date: sanitizeDate(item?.date),
    type: String(item?.type || "").trim() || "运动",
    durationMin: num(item?.durationMin),
    note: item?.note ? String(item.note).trim() : undefined,
  };
}

function parseHHMM(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h + min / 60;
}

function computeSleepHours(bedtime, waketime, fallback) {
  const b = parseHHMM(bedtime);
  const w = parseHHMM(waketime);
  if (b == null || w == null) return num(fallback);
  let diff = w - b;
  if (diff <= 0) diff += 24;
  return Math.round(diff * 10) / 10;
}

function sanitizeSleep(item) {
  const id = String(item?.id || "").trim();
  if (!id) throw new Error("睡眠记录缺少 id");
  const bedtime = String(item?.bedtime || "").trim();
  const waketime = String(item?.waketime || "").trim();
  return {
    id,
    date: sanitizeDate(item?.date),
    bedtime,
    waketime,
    hours: computeSleepHours(bedtime, waketime, item?.hours),
    note: item?.note ? String(item.note).trim() : undefined,
  };
}

function sanitizeProfile(profile) {
  return {
    heightCm: num(profile?.heightCm),
    targetWeightKg: num(profile?.targetWeightKg),
    maxWeightKg: num(profile?.maxWeightKg),
  };
}

function sortByDateAsc(items) {
  return [...items].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

function sanitizeList(items, fn) {
  if (!Array.isArray(items)) throw new Error("items 必须是数组");
  return sortByDateAsc(items.map(fn));
}

async function getDoc() {
  const container = await getCosmosContainer();
  try {
    const result = await container.item(DOC_ID, DOC_PK).read();
    return result?.resource || null;
  } catch (err) {
    if (Number(err?.code || err?.statusCode) === 404) return null;
    throw err;
  }
}

function readDoc(resource) {
  return {
    profile: sanitizeProfile(resource?.profile || {}),
    bodyMetrics: sortByDateAsc((resource?.bodyMetrics || []).map(sanitizeBody)),
    exercises: sortByDateAsc((resource?.exercises || []).map(sanitizeExercise)),
    sleeps: sortByDateAsc((resource?.sleeps || []).map(sanitizeSleep)),
    updatedAt: resource?.updatedAt || null,
  };
}

async function getHealth() {
  const resource = await getDoc();
  if (!resource) {
    return {
      profile: { heightCm: null, targetWeightKg: null, maxWeightKg: null },
      bodyMetrics: [],
      exercises: [],
      sleeps: [],
      updatedAt: null,
    };
  }
  return readDoc(resource);
}

async function persistSection(patch) {
  const current = await getHealth();
  const container = await getCosmosContainer();
  const payload = {
    id: DOC_ID,
    pk: DOC_PK,
    profile: current.profile,
    bodyMetrics: current.bodyMetrics,
    exercises: current.exercises,
    sleeps: current.sleeps,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const result = await container.items.upsert(payload);
  return readDoc(result.resource || payload);
}

async function updateProfile(profile) {
  return persistSection({ profile: sanitizeProfile(profile) });
}

async function updateBodyMetrics(items) {
  return persistSection({ bodyMetrics: sanitizeList(items, sanitizeBody) });
}

async function updateExercises(items) {
  return persistSection({ exercises: sanitizeList(items, sanitizeExercise) });
}

async function updateSleeps(items) {
  return persistSection({ sleeps: sanitizeList(items, sanitizeSleep) });
}

module.exports = {
  getHealth,
  updateProfile,
  updateBodyMetrics,
  updateExercises,
  updateSleeps,
};
