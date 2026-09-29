import { randomBytes, randomUUID } from 'node:crypto';
import { getStore } from '@edgeone/pages-blob';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomLifetime = 2 * 60 * 60 * 1000;
const eventLimit = 500;

function makeCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function cleanName(value, fallback) {
  return String(value || fallback).trim().slice(0, 16) || fallback;
}

// 0 是合法取值（无风、无燃料、无限时），不能用 `|| 默认值` 覆盖。
function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function cleanSettings(settings = {}) {
  return {
    mapPreset: String(settings.mapPreset || 'generated').slice(0, 24),
    turnTime: clampInt(settings.turnTime, 0, 60, 0),
    initialHealth: clampInt(settings.initialHealth, 50, 300, 100),
    windStrength: clampInt(settings.windStrength, 0, 3, 2),
    movementFuel: clampInt(settings.movementFuel, 0, 600, 220),
  };
}

function counter(value) {
  return Math.max(0, Math.min(1e9, Math.trunc(Number(value) || 0)));
}

function appendEvent(room, message, target = null) {
  room.sequence += 1;
  room.events.push({ seq: room.sequence, target, message });
  if (room.events.length > eventLimit) room.events.splice(0, room.events.length - eventLimit);
  room.updatedAt = Date.now();
}

async function getRoom(store, code) {
  return await store.get(`rooms/${code}`, { type: 'json', consistency: 'strong' });
}

export async function onRequest({ request }) {
  const store = getStore('tank-duel-rooms');
  if (request.method === 'POST') return handlePost(request, store);
  if (request.method === 'GET') return handlePoll(request, store);
  return json({ error: 'Method not allowed' }, 405);
}

async function handlePost(request, store) {
  let message;
  try {
    message = await request.json();
  } catch {
    return json({ error: '无效的联机请求。' }, 400);
  }

  if (message.action === 'create') {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = makeCode();
      const token = randomUUID();
      const now = Date.now();
      const room = {
        code,
        status: 'waiting',
        players: [{ name: cleanName(message.name, '房主'), token }],
        sequence: 0,
        events: [],
        createdAt: now,
        updatedAt: now,
      };
      // Pages Blob 不强制 onlyIfNew，需先确认配对码未被占用。
      const existing = await getRoom(store, code);
      if (existing && now - existing.updatedAt <= roomLifetime) continue;
      await store.setJSON(`rooms/${code}`, room);
      return json({ type: 'created', code, playerIndex: 0, token, cursor: 0 });
    }
    return json({ error: '暂时无法创建房间，请重试。' }, 503);
  }

  if (message.action === 'join') {
    const code = String(message.code || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: '配对码格式错误。' }, 400);
    const room = await getRoom(store, code);
    if (!room || Date.now() - room.updatedAt > roomLifetime || room.status !== 'waiting' || room.players.length !== 1) {
      return json({ error: '房间不存在或已满，请检查配对码。' }, 404);
    }
    const token = randomUUID();
    room.players.push({ name: cleanName(message.name, '玩家 2'), token });
    room.status = 'ready';
    appendEvent(room, { type: 'joined', playerIndex: 0 }, 0);
    await store.setJSON(`rooms/${code}`, room);
    return json({ type: 'joined', code, playerIndex: 1, token, cursor: 0 });
  }

  const code = String(message.roomCode || '').toUpperCase();
  const playerIndex = Number(message.playerIndex);
  if (!/^[A-Z0-9]{6}$/.test(code) || !Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) {
    return json({ error: '房间信息无效。' }, 400);
  }
  const room = await getRoom(store, code);
  if (!room || Date.now() - room.updatedAt > roomLifetime) return json({ error: '房间已过期。' }, 404);
  if (!room.players[playerIndex] || room.players[playerIndex].token !== message.token) {
    return json({ error: '房间身份验证失败。' }, 403);
  }

  if (message.type === 'close') {
    const opponent = 1 - playerIndex;
    // 对手仍在房间时先通知其离开；双方都离开或无人加入时才删除房间。
    if (room.players[opponent] && !room.left?.includes(opponent)) {
      room.left = [...(room.left ?? []), playerIndex];
      room.status = 'closed';
      appendEvent(room, { type: 'left', playerIndex }, opponent);
      await store.setJSON(`rooms/${code}`, room);
    } else {
      await store.delete(`rooms/${code}`);
    }
    return json({ ok: true });
  }

  if (message.type === 'start') {
    if (playerIndex !== 0 || room.status !== 'ready') return json({ error: '房间尚未准备好。' }, 409);
    room.status = 'playing';
    room.seed = String(message.seed || '').slice(0, 32);
    room.settings = cleanSettings(message.settings);
    for (let index = 0; index < room.players.length; index += 1) {
      appendEvent(room, {
        type: 'start',
        seed: room.seed,
        player1Name: room.players[0].name,
        player2Name: room.players[1].name,
        settings: room.settings,
        playerIndex: index,
      }, index);
    }
  } else if (message.type === 'input') {
    if (room.status !== 'playing') return json({ error: '对局尚未开始。' }, 409);
    const input = message.input;
    const numbers = ['x', 'y', 'angle', 'power', 'health', 'fuel'];
    if (!input || numbers.some((key) => !Number.isFinite(input[key]))) {
      return json({ error: '输入数据无效。' }, 400);
    }
    appendEvent(room, {
      type: 'input',
      input: {
        turn: counter(input.turn),
        move: Math.max(-1, Math.min(1, Math.trunc(Number(input.move) || 0))),
        x: input.x,
        y: input.y,
        angle: Math.max(0, Math.min(180, input.angle)),
        power: Math.max(0, Math.min(2000, input.power)),
        health: Math.max(0, input.health),
        fuel: Math.max(0, input.fuel),
        weaponId: String(input.weaponId || 'basic_shell').replace(/[^a-z0-9_]/gi, '').slice(0, 32),
        fire: counter(input.fire),
        pass: counter(input.pass),
        flightTick: counter(input.flightTick),
        detonateAt: counter(input.detonateAt),
      },
    }, 1 - playerIndex);
  } else {
    return json({ error: '未知的联机消息。' }, 400);
  }

  await store.setJSON(`rooms/${code}`, room);
  return json({ ok: true });
}

async function handlePoll(request, store) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get('room') || '').toUpperCase();
  const playerIndex = Number(url.searchParams.get('player'));
  const token = url.searchParams.get('token') || '';
  const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
  if (!/^[A-Z0-9]{6}$/.test(code) || !Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1 || !token) {
    return json({ error: '房间信息无效。' }, 400);
  }

  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const room = await getRoom(store, code);
    if (!room || Date.now() - room.updatedAt > roomLifetime) return json({ error: '房间已过期。' }, 404);
    if (!room.players[playerIndex] || room.players[playerIndex].token !== token) return json({ error: '房间身份验证失败。' }, 403);
    const oldestSequence = room.events[0]?.seq ?? room.sequence + 1;
    if (after < oldestSequence - 1) return json({ error: '联机消息已过期，请重新加入房间。' }, 409);
    const events = room.events.filter((event) => event.seq > after && (event.target === null || event.target === playerIndex));
    if (events.length > 0) return json({ cursor: room.sequence, events });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const room = await getRoom(store, code);
  return json({ cursor: room?.sequence ?? after, events: [] });
}
