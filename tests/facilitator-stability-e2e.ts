// @ts-nocheck
import assert from "node:assert/strict";
import EstimationServer from "../party/estimation";
import RetroServer from "../party/retro";

type StoredState = Record<string, unknown>;

class MockConnection {
  state: unknown;
  sent: unknown[] = [];

  constructor(readonly id: string) {}

  setState(state: unknown) {
    this.state = state;
  }

  send(message: string) {
    this.sent.push(JSON.parse(message));
  }
}

class MockRoom {
  readonly id: string;
  readonly env = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3456",
    INTERNAL_API_SECRET: "test",
  };
  private connections: MockConnection[] = [];
  private store = new Map<string, unknown>();

  constructor(id: string) {
    this.id = id;
  }

  getConnections() {
    return this.connections;
  }

  add(conn: MockConnection) {
    this.connections.push(conn);
  }

  remove(conn: MockConnection) {
    this.connections = this.connections.filter((c) => c !== conn);
  }

  broadcast(message: string, exclude: string[] = []) {
    for (const conn of this.connections) {
      if (!exclude.includes(conn.id)) conn.send(message);
    }
  }

  storage = {
    get: async <T,>(key: string) => this.store.get(key) as T | undefined,
    put: async (key: string, value: StoredState) => {
      this.store.set(key, value);
    },
  };
}

function ctx(path: string) {
  return { request: { url: `http://partykit.test${path}` } };
}

async function connect(
  server: { onConnect(conn: MockConnection, ctx: ReturnType<typeof ctx>): Promise<void> },
  room: MockRoom,
  path: string,
  id: string,
) {
  const conn = new MockConnection(id);
  // PartyKit includes the connecting socket in getConnections() during onConnect.
  room.add(conn);
  await server.onConnect(conn, ctx(path));
  return conn;
}

async function close(
  server: { onClose(conn: MockConnection): Promise<void> },
  room: MockRoom,
  conn: MockConnection,
) {
  // PartyKit excludes closed sockets from getConnections() by the time close handling matters.
  room.remove(conn);
  await server.onClose(conn);
}

async function send(
  server: { onMessage(message: string, sender: MockConnection): Promise<void> },
  conn: MockConnection,
  event: unknown,
) {
  await server.onMessage(JSON.stringify(event), conn);
}

async function testEstimationFacilitatorStability() {
  const room = new MockRoom("estimation-facilitator-stability");
  const server = new EstimationServer(room as never);
  await server.onStart();

  const a = await connect(server, room, "/?name=Facilitator&anonId=fac-1", "socket-a1");
  assert.equal(server.state.facilitatorId, "fac-1", "first estimation joiner is facilitator");

  const b = await connect(server, room, "/?name=Teammate&anonId=team-1", "socket-b1");
  assert.equal(server.state.facilitatorId, "fac-1", "later estimation joiner must not steal facilitator");

  await close(server, room, a);
  assert.equal(server.state.facilitatorId, "fac-1", "estimation facilitator remains assigned while disconnected");

  await send(server, b, {
    type: "LOAD_TICKET",
    ticket: { ref: "BUG-1", title: "Should not load" },
    facilitatorId: "team-1",
  });
  assert.equal(server.state.ticket, null, "non-facilitator cannot act after facilitator disconnects");

  const a2 = await connect(server, room, "/?name=Facilitator&anonId=fac-1", "socket-a2");
  assert.equal(server.state.facilitatorId, "fac-1", "estimation facilitator reclaims on reconnect via stable id");

  await send(server, a2, {
    type: "LOAD_TICKET",
    ticket: { ref: "BUG-2", title: "Can load" },
    facilitatorId: "fac-1",
  });
  assert.equal(server.state.ticket?.ref, "BUG-2", "reconnected facilitator can continue ceremony");

  const a3 = await connect(server, room, "/?name=Facilitator&anonId=fac-1", "socket-a3");
  await close(server, room, a2);
  assert(
    server.state.participants.some((p) => p.id === "fac-1"),
    "estimation overlapping reconnect does not remove still-connected participant",
  );

  await send(server, a3, {
    type: "TRANSFER_FACILITATION",
    targetId: "team-1",
    facilitatorId: "fac-1",
  });
  assert.equal(server.state.facilitatorId, "team-1", "estimation transfer is explicit and works");
}

async function testRetroFacilitatorStability() {
  const room = new MockRoom("retro-facilitator-stability");
  const server = new RetroServer(room as never);
  await server.onStart();

  const a = await connect(server, room, "/?name=Facilitator&anonId=fac-1&userId=creator", "socket-a1");
  assert.equal(server.state.facilitatorId, "fac-1", "first retro joiner is facilitator");

  await send(server, a, {
    type: "START_RETRO",
    facilitatorId: "fac-1",
    createdBy: "creator",
    previousActions: [],
  });
  assert.equal(server.state.phase, "writing", "retro starts end-to-end from facilitator");

  const b = await connect(server, room, "/?name=Teammate&anonId=team-1", "socket-b1");
  assert.equal(server.state.facilitatorId, "fac-1", "later retro joiner must not steal facilitator");

  const creatorSecondBrowser = await connect(
    server,
    room,
    "/?name=CreatorOtherBrowser&anonId=creator-other&userId=creator",
    "socket-c1",
  );
  assert.equal(
    server.state.facilitatorId,
    "fac-1",
    "creator identity joining later must not override active facilitator",
  );

  await close(server, room, a);
  assert.equal(server.state.facilitatorId, "fac-1", "retro facilitator remains assigned while disconnected");

  await send(server, b, { type: "ADVANCE_PHASE", facilitatorId: "team-1" });
  assert.equal(server.state.phase, "writing", "non-facilitator cannot advance after facilitator disconnects");

  const a2 = await connect(server, room, "/?name=Facilitator&anonId=fac-1&userId=creator", "socket-a2");
  assert.equal(server.state.facilitatorId, "fac-1", "retro facilitator reclaims on reconnect via stable id");

  await send(server, a2, { type: "ADVANCE_PHASE", facilitatorId: "fac-1" });
  assert.equal(server.state.phase, "grouping", "reconnected facilitator can continue retro");

  const a3 = await connect(server, room, "/?name=Facilitator&anonId=fac-1&userId=creator", "socket-a3");
  await close(server, room, a2);
  assert(
    server.state.participants.some((p) => p.id === "fac-1"),
    "retro overlapping reconnect does not remove still-connected participant",
  );

  await send(server, a3, {
    type: "TRANSFER_FACILITATION",
    targetId: "team-1",
    facilitatorId: "fac-1",
  });
  assert.equal(server.state.facilitatorId, "team-1", "retro transfer is explicit and works");

  await close(server, room, creatorSecondBrowser);
}

async function main() {
  await testEstimationFacilitatorStability();
  await testRetroFacilitatorStability();
  console.log("✅ facilitator stability e2e passed for estimation and retro");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
