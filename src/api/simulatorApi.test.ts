import assert from "node:assert/strict";
import test from "node:test";
import { toHorseProfile } from "./horseMapper.ts";
import {
  getWorkoutSimulationContext,
  sessionIdFromSearch,
  SimulatorApiError,
  validateSimulationContext,
  workoutToTrialSetup,
} from "./simulatorApi.ts";

const workoutContext = {
  type: "WORKOUT" as const,
  sessionId: "server-session-1",
  status: "PENDING" as const,
  horse: {
    id: "be71c9bf-482b-426c-957e-246a692a4528",
    horseCode: "HR-000006",
    name: "Storm Runner",
    microchip: "985141002346006",
    microchipRfid: "985141002346006",
    breed: "Thoroughbred",
    dob: "2020-11-10T00:00:00.000Z",
    gender: "Stallion",
    color: "Black",
    status: "IN_TRAINING",
    isMedicalLocked: false,
  },
  workout: {
    id: "workout-1",
    scheduledDate: "2026-10-24T03:00:00.000Z",
    workoutType: "CANTER",
    intensity: "HEAVY",
    distanceMeters: 1200,
    repetitions: 1,
    targetSpeedKmh: 40,
    targetDurationSeconds: 90,
    trackSurface: "DIRT",
  },
};

const examContext = {
  type: "EXAM" as const,
  sessionId: "server-exam-1",
  status: "PENDING" as const,
  medicalRecordId: "med-rec-001",
  horse: {
    id: "be71c9bf-482b-426c-957e-246a692a4528",
    horseCode: "HR-000006",
    name: "Storm Runner",
    microchip: "985141002346006",
    microchipRfid: "985141002346006",
    breed: "Thoroughbred",
    dob: "2020-11-10T00:00:00.000Z",
    gender: "Stallion",
    color: "Black",
    status: "UNDER_OBSERVATION",
    isMedicalLocked: true,
  },
};

test("sessionIdFromSearch requires the backend-issued URL parameter", () => {
  assert.equal(sessionIdFromSearch("?sessionId=server-session-1"), "server-session-1");
  assert.equal(sessionIdFromSearch("?foo=bar&sessionId=session-xyz&active=true"), "session-xyz");
  assert.equal(sessionIdFromSearch("?sessionId=%20%20"), null);
  assert.equal(sessionIdFromSearch("?sessionId=  spaced-id  "), "spaced-id");
  assert.equal(sessionIdFromSearch(""), null);
  assert.equal(sessionIdFromSearch("?other=123"), null);
});

test("getWorkoutSimulationContext loads the exact issued session", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "http://localhost:3000/api/simulator/sessions/server-session-1/context");
    assert.equal(init?.method, "GET");
    return new Response(JSON.stringify({ statusCode: 200, success: true, data: workoutContext }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    assert.deepEqual(await getWorkoutSimulationContext("server-session-1"), workoutContext);
    await assert.rejects(() => getWorkoutSimulationContext(""), /sessionId/);
    await assert.rejects(() => getWorkoutSimulationContext("   "), /sessionId/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workoutToTrialSetup maps BE vocabulary and locks the scheduled configuration", () => {
  assert.deepEqual(workoutToTrialSetup(workoutContext.workout), {
    surface: "SAND",
    distance: 1200,
    intensity: "HEAVY",
    condition: "GOOD",
    obstacles: [],
  });

  assert.deepEqual(
    workoutToTrialSetup({
      ...workoutContext.workout,
      trackSurface: "SYNTHETIC",
      intensity: "LIGHT",
      distanceMeters: 1600,
    }),
    {
      surface: "MIXED",
      distance: 1600,
      intensity: "LIGHT",
      condition: "GOOD",
      obstacles: [],
    },
  );

  assert.deepEqual(
    workoutToTrialSetup({
      ...workoutContext.workout,
      trackSurface: "TURF",
      intensity: "MEDIUM",
      distanceMeters: 800,
    }),
    {
      surface: "GRASS",
      distance: 800,
      intensity: "MODERATE",
      condition: "GOOD",
      obstacles: [],
    },
  );
});

test("Backend API error envelopes surface their code and message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "http://localhost:3000/api/simulator/sessions/bad-session-id/context");
    return new Response(
      JSON.stringify({
        statusCode: 404,
        success: false,
        error: "Not Found",
        code: "SIMULATOR_SESSION_NOT_FOUND",
        message: "Simulation session not found.",
        data: {},
      }),
      {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    let caught: any = null;
    try {
      await getWorkoutSimulationContext("bad-session-id");
    } catch (err: any) {
      caught = err;
    }

    assert.ok(caught instanceof SimulatorApiError);
    assert.equal(caught.statusCode, 404);
    assert.equal(caught.code, "SIMULATOR_SESSION_NOT_FOUND");
    assert.ok(caught.message.includes("SIMULATOR_SESSION_NOT_FOUND"));
    assert.ok(caught.message.includes("Simulation session not found."));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Backend API 403 Forbidden surfaces caller permission violation code and message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        statusCode: 403,
        success: false,
        error: "Forbidden",
        code: "SIMULATOR_SESSION_FORBIDDEN",
        message: "This simulation session belongs to another trainer.",
      }),
      {
        status: 403,
        statusText: "Forbidden",
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    let caught: any = null;
    try {
      await getWorkoutSimulationContext("forbidden-session-id");
    } catch (err: any) {
      caught = err;
    }

    assert.ok(caught instanceof SimulatorApiError);
    assert.equal(caught.statusCode, 403);
    assert.equal(caught.code, "SIMULATOR_SESSION_FORBIDDEN");
    assert.ok(caught.message.includes("SIMULATOR_SESSION_FORBIDDEN"));
    assert.ok(caught.message.includes("This simulation session belongs to another trainer."));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Horse mapping preserves Backend horse_id and microchip masking", () => {
  const profile = toHorseProfile(workoutContext.horse, 0);

  // Must preserve backend horse UUID
  assert.equal(profile.id, "be71c9bf-482b-426c-957e-246a692a4528");
  assert.equal(profile.code, "HR-000006");
  assert.equal(profile.name, "Storm Runner");
  assert.equal(profile.microchip, "985141002346006");

  // Masked microchip (e.g. from Groom perspective in Backend) is preserved and not altered
  const maskedHorse = {
    ...workoutContext.horse,
    id: "be71c9bf-482b-426c-957e-246a692a4528",
    microchip: "***********6006",
    microchipRfid: "***********6006",
  };
  const maskedProfile = toHorseProfile(maskedHorse, 0);
  assert.equal(maskedProfile.id, "be71c9bf-482b-426c-957e-246a692a4528");
  assert.equal(maskedProfile.microchip, "***********6006");
});

test("validateSimulationContext rejects malformed HTTP 200 payloads with INVALID_SIMULATOR_CONTEXT", () => {
  const sessionId = "valid-session-1";

  // Not an object
  assert.throws(
    () => validateSimulationContext(sessionId, null),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );
  assert.throws(
    () => validateSimulationContext(sessionId, "invalid-string"),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // Missing or empty sessionId
  assert.throws(
    () => validateSimulationContext(sessionId, { ...workoutContext, sessionId: "" }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // SessionId mismatch
  assert.throws(
    () => validateSimulationContext(sessionId, { ...workoutContext, sessionId: "other-session" }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // Invalid type
  assert.throws(
    () => validateSimulationContext(sessionId, { ...workoutContext, sessionId, type: "RACE" }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // Missing horse
  assert.throws(
    () => validateSimulationContext(sessionId, { ...workoutContext, sessionId, horse: null }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // Missing horse.id
  assert.throws(
    () =>
      validateSimulationContext(sessionId, {
        ...workoutContext,
        sessionId,
        horse: { ...workoutContext.horse, id: "" },
      }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // WORKOUT missing workout object
  assert.throws(
    () => validateSimulationContext(sessionId, { ...workoutContext, sessionId, workout: null }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // WORKOUT missing workout.id
  assert.throws(
    () =>
      validateSimulationContext(sessionId, {
        ...workoutContext,
        sessionId,
        workout: { ...workoutContext.workout, id: "" },
      }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );

  // WORKOUT missing valid distanceMeters
  assert.throws(
    () =>
      validateSimulationContext(sessionId, {
        ...workoutContext,
        sessionId,
        workout: { ...workoutContext.workout, distanceMeters: -100 },
      }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );
  assert.throws(
    () =>
      validateSimulationContext(sessionId, {
        ...workoutContext,
        sessionId,
        workout: { ...workoutContext.workout, distanceMeters: NaN },
      }),
    (err: any) => err instanceof SimulatorApiError && err.code === "INVALID_SIMULATOR_CONTEXT",
  );
});

test("validateSimulationContext succeeds for valid EXAM and WORKOUT contexts", async () => {
  // WORKOUT valid
  const validatedWorkout = validateSimulationContext("server-session-1", workoutContext);
  assert.equal(validatedWorkout.type, "WORKOUT");
  assert.equal(validatedWorkout.sessionId, "server-session-1");

  // EXAM valid with medicalRecordId
  const validatedExam = validateSimulationContext("server-exam-1", examContext);
  assert.equal(validatedExam.type, "EXAM");
  assert.equal(validatedExam.sessionId, "server-exam-1");
  assert.equal((validatedExam as typeof examContext).medicalRecordId, "med-rec-001");

  // EXAM valid with null medicalRecordId
  const validatedExamNull = validateSimulationContext("server-exam-1", {
    ...examContext,
    medicalRecordId: null,
  });
  assert.equal(validatedExamNull.type, "EXAM");
  assert.equal((validatedExamNull as typeof examContext).medicalRecordId, null);

  // EXAM loaded through getWorkoutSimulationContext
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ statusCode: 200, success: true, data: examContext }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const loaded = await getWorkoutSimulationContext("server-exam-1");
    assert.equal(loaded.type, "EXAM");
    assert.equal(loaded.sessionId, "server-exam-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getWorkoutSimulationContext surfaces network failure when backend is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => getWorkoutSimulationContext("offline-check"),
      (err: any) => err instanceof TypeError && err.message.includes("fetch failed"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
