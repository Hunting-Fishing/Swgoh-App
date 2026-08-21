import { gacAttackPlanService } from "./gac-attack-plan-service.mjs";
import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import {
  assertSameOrigin,
  datacronById,
  eventInstanceId,
  normalizeAllyCode,
  normalizeBaseId,
  readJsonBody,
  rosterUnits,
  validRound,
} from "./gac-board-observation-api.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
function normalizedIds(values = []) {
  return [...new Set(asArray(values).map((value) => normalizeBaseId(value?.baseId || value)).filter(Boolean))];
}
function exactExecutionSlot(value) {
  if (value === null || value === undefined || value === "") return null;
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}
function defenseDatacronState(defense = {}) {
  const state = clean(defense?.datacronState).toLowerCase();
  const id = clean(defense?.datacron?.id);
  if (state === "assigned" && id) return { state: "assigned", id };
  if (state === "none") return { state: "none", id: "" };
  return { state: "unknown", id: "" };
}
function executionDefenderMembers(assignment = {}, defense = {}) {
  if (clean(assignment?.planKind).toLowerCase() === "cleanup") {
    return normalizedIds(assignment?.cleanup?.survivorBaseIds);
  }
  return normalizedIds(defense?.members);
}
function executionConfirmationSnapshot(assignment = {}, defense = {}) {
  const defenderDc = defenseDatacronState(defense);
  return Object.freeze({
    version: "b08-v1",
    assignmentId: Number(assignment?.id) || null,
    defenseId: Number(assignment?.defenseId || defense?.id) || null,
    zone: clean(defense?.zone),
    slot: exactExecutionSlot(defense?.slot),
    attackerLeaderBaseId: normalizeBaseId(assignment?.leaderBaseId),
    attackerMembers: Object.freeze(normalizedIds(assignment?.members)),
    attackerDatacronId: clean(assignment?.datacron?.id),
    defenderLeaderBaseId: normalizeBaseId(defense?.leaderBaseId),
    defenderMembers: Object.freeze(executionDefenderMembers(assignment, defense)),
    defenderDatacronState: defenderDc.state,
    defenderDatacronId: defenderDc.id,
  });
}
function assertExecutionConfirmation(submitted = {}, assignment = {}, defense = {}) {
  const expected = executionConfirmationSnapshot(assignment, defense);
  const normalized = {
    version: clean(submitted?.version),
    assignmentId: Number(submitted?.assignmentId) || null,
    defenseId: Number(submitted?.defenseId) || null,
    zone: clean(submitted?.zone),
    slot: exactExecutionSlot(submitted?.slot),
    attackerLeaderBaseId: normalizeBaseId(submitted?.attackerLeaderBaseId),
    attackerMembers: normalizedIds(submitted?.attackerMembers),
    attackerDatacronId: clean(submitted?.attackerDatacronId),
    defenderLeaderBaseId: normalizeBaseId(submitted?.defenderLeaderBaseId),
    defenderMembers: normalizedIds(submitted?.defenderMembers),
    defenderDatacronState: clean(submitted?.defenderDatacronState).toLowerCase(),
    defenderDatacronId: clean(submitted?.defenderDatacronId),
  };
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    const error = new Error("The pre-battle confirmation no longer matches the locked attack and current saved defense. Re-open the checklist and verify the battle again.");
    error.status = 409;
    throw error;
  }
  if (!expected.zone || expected.slot === null) {
    const error = new Error("The locked enemy defense must have an exact saved board zone and slot before beginning the attempt.");
    error.status = 409;
    throw error;
  }
  if (clean(assignment?.planKind).toLowerCase() === "cleanup") {
    const original = new Set(normalizedIds(defense?.members));
    const invalid = expected.defenderMembers.filter((id) => !original.has(id));
    if (!expected.defenderMembers.length || invalid.length) {
      const error = new Error("The cleanup plan no longer has a valid confirmed survivor composition for the saved defense. Rebuild cleanup intelligence before battle.");
      error.status = 409;
      throw error;
    }
  }
  if (expected.defenderDatacronState === "unknown") {
    const error = new Error("Confirm the enemy Datacron as exact assigned or confirmed none before beginning the attempt.");
    error.status = 409;
    throw error;
  }
  return expected;
}
function assertExecutionLiveState(assignment = {}, liveRoster = {}, ownBoard = {}) {
  const members = normalizedIds(assignment?.members);
  const liveUnits = rosterUnits(liveRoster);
  const missing = members.filter((id) => !liveUnits.has(id));
  if (missing.length) {
    const error = new Error(`The locked attack contains units not present in your current live roster: ${missing.join(", ")}.`);
    error.status = 409;
    throw error;
  }
  const defended = new Set(asArray(ownBoard?.defenses).flatMap((defense) => normalizedIds(defense?.members)));
  const reserved = members.filter((id) => defended.has(id));
  if (reserved.length) {
    const error = new Error(`The locked attack now overlaps your verified defense: ${reserved.join(", ")}. Release or correct the plan before battle.`);
    error.status = 409;
    throw error;
  }
  const datacronId = clean(assignment?.datacron?.id);
  if (datacronId) datacronById(liveRoster, datacronId, "player");
  return true;
}

export function createGacAttackPlanApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const boards = options.boards || gacBoardObservationService;
  const plans = options.plans || gacAttackPlanService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for the war room.");
      error.status = 404;
      throw error;
    }
    const liveRound = bracketIndex.currentRoundFrom?.(playerContext, currentEvent) ?? null;
    const requestedRound = validRound(requestedRoundInput);
    if (liveRound && requestedRound && liveRound !== requestedRound) {
      const error = new Error(`The live GAC context reports Round ${liveRound}, not Round ${requestedRound}.`);
      error.status = 409;
      throw error;
    }
    const round = liveRound || requestedRound;
    if (!round) {
      const error = new Error("Select the current GAC Round 1, 2, or 3 before using the war room.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent for this event and round before using the war room.");
      error.status = 409;
      throw error;
    }
    return { eventInstanceId: id, round, confirmed };
  }

  async function commonInput(userId, code, roundInput) {
    const context = await currentContext(code, roundInput);
    return {
      userId,
      context,
      input: {
        allyCode: code,
        opponentAllyCode: normalizeAllyCode(context.confirmed.opponent.allyCode),
        eventInstanceId: context.eventInstanceId,
        round: context.round,
      },
    };
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = url.pathname.match(/^\/api\/gac\/attack-plan\/(\d{9})$/);
      if (!match || !["GET", "POST", "PATCH"].includes(request.method)) return false;
      try {
        if (["POST", "PATCH"].includes(request.method)) assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account to use the GAC war room.");
          error.status = 401;
          throw error;
        }
        const code = normalizeAllyCode(match[1]);
        if (!code) {
          const error = new Error("A valid 9-digit Ally Code is required.");
          error.status = 400;
          throw error;
        }

        if (request.method === "GET") {
          const common = await commonInput(user.id, code, url.searchParams.get("round"));
          const result = await plans.getAssignments(user.id, common.input);
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-War-Room": "verified-owner",
          });
          return true;
        }

        const body = await readJsonBody(request);
        const common = await commonInput(user.id, code, body?.round);
        if (request.method === "PATCH") {
          const requestedStatus = clean(body?.status).toLowerCase();
          const assignmentId = Number(body?.id);
          const currentPlans = await plans.getAssignments(user.id, common.input);
          const currentAssignment = asArray(currentPlans?.assignments).find((row) => Number(row?.id) === assignmentId) || null;
          if (!currentAssignment) {
            const error = new Error("That war-room assignment does not belong to the verified current round.");
            error.status = 404;
            throw error;
          }
          const previousStatus = clean(currentAssignment?.status).toLowerCase();
          if (previousStatus === "planned" && ["win", "loss"].includes(requestedStatus)) {
            const error = new Error("Begin the verified attempt through the pre-battle checklist before recording a win or loss.");
            error.status = 409;
            throw error;
          }
          if (previousStatus === "planned" && requestedStatus === "attempted") {
            const [liveRoster, ownBoard, opponentBoard] = await Promise.all([
              requestGateway(`/v1/player/${code}`, true),
              boards.getPlayerDefenses(user.id, common.input),
              boards.getDefenses(user.id, common.input),
            ]);
            const defense = asArray(opponentBoard?.defenses).find((row) => Number(row?.id) === Number(currentAssignment?.defenseId)) || null;
            if (!defense) {
              const error = new Error("The locked enemy defense is no longer present in the verified current board.");
              error.status = 409;
              throw error;
            }
            assertExecutionConfirmation(body?.executionConfirmation, currentAssignment, defense);
            assertExecutionLiveState(currentAssignment, liveRoster, ownBoard);
          }
          const result = await plans.updateStatus(user.id, {
            ...common.input,
            id: body?.id,
            status: body?.status,
            banners: body?.banners,
            postAttempt: body?.postAttempt,
          });
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-War-Room": "verified-owner",
          });
          return true;
        }

        const members = [...new Set(asArray(body?.members).map(normalizeBaseId).filter(Boolean))];
        const leaderBaseId = normalizeBaseId(body?.leaderBaseId);
        if (!members.length || !leaderBaseId || !members.includes(leaderBaseId)) {
          const error = new Error("Select a complete planned attack squad and its leader.");
          error.status = 400;
          throw error;
        }

        const [liveRoster, ownBoard] = await Promise.all([
          requestGateway(`/v1/player/${code}`, true),
          boards.getPlayerDefenses(user.id, common.input),
        ]);
        const liveUnits = rosterUnits(liveRoster);
        const missing = members.filter((id) => !liveUnits.has(id));
        if (missing.length) {
          const error = new Error(`The planned counter contains units not present in your current live roster: ${missing.join(", ")}.`);
          error.status = 409;
          throw error;
        }
        const defended = new Set(asArray(ownBoard?.defenses).flatMap((defense) => asArray(defense?.members).map(normalizeBaseId)));
        const reserved = members.filter((id) => defended.has(id));
        if (reserved.length) {
          const error = new Error(`Those attackers are already reserved on your verified defense: ${reserved.join(", ")}.`);
          error.status = 409;
          throw error;
        }

        const datacronId = clean(body?.datacronId);
        const datacron = datacronId ? datacronById(liveRoster, datacronId, "player") : null;
        const result = await plans.saveAssignment(user.id, {
          ...common.input,
          defenseId: body?.defenseId,
          leaderBaseId,
          members,
          datacron,
          sourceRef: "gac-command-center-round-war-room",
        });
        writeJson(response, 200, result, {
          "X-GAC-Source": result.source,
          "X-GAC-War-Room": "verified-owner",
        });
      } catch (error) {
        writeJson(response, statusFor(error), { error: error?.message || "The GAC war-room request could not be processed." });
      }
      return true;
    },
  });
}

export {
  assertExecutionConfirmation,
  assertExecutionLiveState,
  defenseDatacronState,
  exactExecutionSlot,
  executionConfirmationSnapshot,
  executionDefenderMembers,
  normalizedIds,
  statusFor,
};