const Helmet = require("../models/Helmet");
const User = require("../models/User");
const HelmetData = require("../models/HelmetData");
const HelmetCommand = require("../models/HelmetCommand");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { USER_ROLES } = require("../constants/roles");
const { helmetOfflineAfterSeconds } = require("../config/appConfig");

// Permissive on purpose — no existing part of the system (validationService,
// User.helmetId, HelmetCommand.helmetId) enforces any helmetId format
// today, so this only rejects blank/whitespace/unsafe input, not a
// particular device-naming scheme.
const HELMET_ID_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

// The one place the online/offline heartbeat rule is evaluated — every
// caller (helmet details, dashboard helmet health, dashboard location
// freshness) goes through this so they can never disagree.
function isRecentEnoughToBeOnline(lastSeenAt) {
  if (!lastSeenAt) return null;
  return Date.now() - new Date(lastSeenAt).getTime() <= helmetOfflineAfterSeconds * 1000;
}

// Bulk "last packet per helmet" — one aggregation using the existing
// {helmetId:1, timestamp:-1} index instead of N per-helmet queries or a full
// HelmetData scan. Returns a Map<helmetId, Date>; a helmetId with no packets
// at all is simply absent from the map (never a fabricated timestamp).
async function getLastSeenMap(helmetIds) {
  if (!helmetIds.length) return new Map();

  const rows = await HelmetData.aggregate([
    { $match: { helmetId: { $in: helmetIds } } },
    { $sort: { helmetId: 1, timestamp: -1 } },
    { $group: { _id: "$helmetId", lastSeen: { $first: "$timestamp" } } },
  ]);

  return new Map(rows.map((row) => [row._id, row.lastSeen]));
}

// User.helmetId is the one authoritative assignment relationship (see
// userService) — Helmet never stores it. Fetched once per list/detail
// request rather than N+1 queries per row.
async function getAssignedWorkerMap() {
  const workers = await User.find(
    { active: true, role: USER_ROLES.WORKER, helmetId: { $ne: null } },
    "userId name helmetId"
  );
  const map = new Map();
  for (const worker of workers) {
    map.set(worker.helmetId, { userId: worker.userId, name: worker.name });
  }
  return map;
}

function toListItem(helmet, assignedMap) {
  const assignedTo = assignedMap.get(helmet.helmetId) || null;
  return {
    helmetId: helmet.helmetId,
    status: helmet.status,
    assigned: !!assignedTo,
    assignedTo,
    createdAt: helmet.createdAt,
    updatedAt: helmet.updatedAt,
  };
}

// GET /api/helmets — ADMIN only.
async function listHelmets({ page, limit, search, assignment, status }) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const assignedMap = await getAssignedWorkerMap();
  const assignedIds = [...assignedMap.keys()];

  const filter = { active: true };

  if (status === "ACTIVE" || status === "INACTIVE") {
    filter.status = status;
  }
  if (assignment === "assigned") {
    filter.helmetId = { $in: assignedIds };
  } else if (assignment === "unassigned") {
    filter.helmetId = { $nin: assignedIds };
  }

  if (search && search.trim()) {
    const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const nameMatchedIds = [...assignedMap.entries()].filter(([, w]) => regex.test(w.name)).map(([id]) => id);
    const orConditions = [{ helmetId: regex }];
    if (nameMatchedIds.length) orConditions.push({ helmetId: { $in: nameMatchedIds } });
    filter.$and = [{ $or: orConditions }];
  }

  const [helmets, total] = await Promise.all([
    Helmet.find(filter).sort({ helmetId: 1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
    Helmet.countDocuments(filter),
  ]);

  return {
    helmets: helmets.map((h) => toListItem(h, assignedMap)),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
  };
}

// GET /api/helmets/:helmetId — ADMIN only. Aggregates read-only operational
// info from the collections that already own it (HelmetData, HelmetCommand,
// WorkerProcessingState) rather than duplicating any of it onto Helmet.
async function getHelmetDetails(helmetId) {
  const helmet = await Helmet.findOne({ helmetId, active: true });
  if (!helmet) {
    return { ok: false, status: 404, message: "Helmet not found" };
  }

  const assignedWorker = await User.findOne({ helmetId, role: USER_ROLES.WORKER, active: true });

  const [latestPacket, latestCommand, workerState] = await Promise.all([
    HelmetData.findOne({ helmetId }).sort({ timestamp: -1 }),
    HelmetCommand.findOne({ helmetId }),
    assignedWorker ? WorkerProcessingState.findOne({ workerId: assignedWorker.userId }) : null,
  ]);

  const lastSeenAt = latestPacket ? latestPacket.timestamp : null;
  // null (not false) when the helmet has never sent anything — "no
  // telemetry yet" is a distinct state from "offline" (#20).
  const online = isRecentEnoughToBeOnline(lastSeenAt);

  return {
    ok: true,
    status: 200,
    body: {
      helmet: { helmetId: helmet.helmetId, status: helmet.status, createdAt: helmet.createdAt, updatedAt: helmet.updatedAt },
      assigned: !!assignedWorker,
      assignedTo: assignedWorker ? { userId: assignedWorker.userId, name: assignedWorker.name } : null,
      online,
      lastSeenAt,
      latestCommand: latestCommand ? { command: latestCommand.command, risk: latestCommand.risk } : null,
      workerSafety: assignedWorker
        ? {
            currentRiskState: workerState ? workerState.currentRiskState : null,
            emergencyActive: workerState ? workerState.emergencyActive : false,
          }
        : null,
    },
  };
}

// POST /api/helmets — ADMIN only. Deliberate registration only — never
// called from packet ingestion (#5), so an unregistered device can't add
// itself to the roster just by talking to /api/helmet/data.
async function createHelmet({ helmetId }) {
  if (typeof helmetId !== "string" || !helmetId.trim()) {
    return { ok: false, status: 400, message: "helmetId is required" };
  }

  const trimmed = helmetId.trim();
  if (!HELMET_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      status: 400,
      message: "helmetId must be 3-40 characters (letters, numbers, hyphen, underscore only)",
    };
  }

  const existing = await Helmet.findOne({ helmetId: trimmed });
  if (existing) {
    return { ok: false, status: 409, message: "Helmet ID already exists" };
  }

  const helmet = await Helmet.create({ helmetId: trimmed });
  return { ok: true, status: 201, body: { helmet: toListItem(helmet, new Map()) } };
}

// DELETE /api/helmets/:helmetId — ADMIN only. Blocks deletion outright
// while assigned (#10) rather than silently unassigning — soft-deletes
// otherwise, never touching HelmetData/HelmetCommand/Alert history (#11).
async function deleteHelmet(helmetId) {
  const helmet = await Helmet.findOne({ helmetId, active: true });
  if (!helmet) {
    return { ok: false, status: 404, message: "Helmet not found" };
  }

  const assignedWorker = await User.findOne({ helmetId, role: USER_ROLES.WORKER, active: true });
  if (assignedWorker) {
    return {
      ok: false,
      status: 409,
      message: "Helmet is currently assigned to a worker. Unassign it before deleting.",
    };
  }

  helmet.active = false;
  helmet.deletedAt = new Date();
  await helmet.save();

  return { ok: true, status: 200, body: { message: "Helmet deleted successfully" } };
}

// GET /api/helmets/assignable — ADMIN only. Backs the Add/Edit User helmet
// dropdown. `currentHelmetId` lets the Edit User form include the helmet
// already held by the user being edited, even though it's technically
// "assigned" (to that same user).
async function getAssignableHelmets(currentHelmetId) {
  const assignedIds = await User.find({ active: true, helmetId: { $ne: null } }).distinct("helmetId");
  const excluded = currentHelmetId ? assignedIds.filter((id) => id !== currentHelmetId) : assignedIds;

  return Helmet.find({ active: true, status: "ACTIVE", helmetId: { $nin: excluded } }).sort({ helmetId: 1 });
}

module.exports = {
  listHelmets,
  getHelmetDetails,
  createHelmet,
  deleteHelmet,
  getAssignableHelmets,
  // Shared with dashboardService so helmet online/offline and worker
  // assignment are never computed two different ways (#17).
  getAssignedWorkerMap,
  isRecentEnoughToBeOnline,
  getLastSeenMap,
};
