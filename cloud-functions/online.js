const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function send(socket, value) {
  if (socket.readyState === 1) socket.send(JSON.stringify(value));
}

function detach(room, socket) {
  room.players = room.players.filter((player) => player.socket !== socket);
  if (room.players.length === 0) rooms.delete(room.code);
  else for (const player of room.players) send(player.socket, { type: 'peer-left' });
}

export function onRequest({ request }) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 });
  }
  if (typeof WebSocketPair === 'undefined') {
    return new Response('This EdgeOne runtime does not expose WebSocketPair.', { status: 501 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  let room = null;
  server.accept();

  server.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      send(server, { type: 'error', message: '无效的联机请求。' });
      return;
    }

    if (message.type === 'create') {
      if (room) return;
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      room = { code, players: [{ socket: server, name: String(message.name || '房主').slice(0, 16) }] };
      rooms.set(code, room);
      send(server, { type: 'created', code, playerIndex: 0 });
      return;
    }

    if (message.type === 'join') {
      if (room) return;
      const requestedCode = String(message.code || '').toUpperCase();
      const targetRoom = rooms.get(requestedCode);
      if (!targetRoom || targetRoom.players.length !== 1) {
        send(server, { type: 'error', message: '房间不存在或已满，请检查配对码。' });
        return;
      }
      room = targetRoom;
      room.players.push({ socket: server, name: String(message.name || '玩家 2').slice(0, 16) });
      send(server, { type: 'joined', playerIndex: 1 });
      send(room.players[0].socket, { type: 'joined', playerIndex: 0 });
      return;
    }

    if (!room) {
      send(server, { type: 'error', message: '请先创建房间或加入房间。' });
      return;
    }

    const playerIndex = room.players.findIndex((player) => player.socket === server);
    if (message.type === 'start' && playerIndex !== 0) return;
    if (message.type === 'start') {
      message.seed = String(message.seed || '').slice(0, 32);
      message.player1Name = room.players[0].name;
      message.player2Name = room.players[1]?.name || '玩家 2';
      const settings = message.settings || {};
      message.settings = {
        mapPreset: String(settings.mapPreset || 'generated').slice(0, 24),
        turnTime: Math.max(0, Math.min(60, Math.trunc(Number(settings.turnTime) || 0))),
        initialHealth: Math.max(50, Math.min(300, Math.trunc(Number(settings.initialHealth) || 100))),
        windStrength: Math.max(0, Math.min(3, Math.trunc(Number(settings.windStrength) || 2))),
        movementFuel: Math.max(0, Math.min(600, Math.trunc(Number(settings.movementFuel) || 220))),
      };
      for (let index = 0; index < room.players.length; index += 1) {
        send(room.players[index].socket, { ...message, playerIndex: index });
      }
      return;
    }
    if (message.type === 'input') {
      const input = message.input;
      if (!input || !Number.isFinite(input.angle) || !Number.isFinite(input.power)) return;
      message.input = {
        move: Math.max(-1, Math.min(1, Math.trunc(input.move))),
        angle: Math.max(0, Math.min(180, input.angle)),
        power: Math.max(150, Math.min(1100, input.power)),
        fire: Math.max(0, Math.trunc(input.fire)),
        switchWeapon: Math.max(0, Math.trunc(input.switchWeapon)),
        detonate: Math.max(0, Math.trunc(input.detonate)),
      };
    }
    for (const player of room.players) {
      if (player.socket !== server) send(player.socket, { ...message, playerIndex });
    }
  });

  server.addEventListener('close', () => {
    if (room) detach(room, server);
  });
  server.addEventListener('error', () => {
    if (room) detach(room, server);
  });

  return new Response(null, { status: 101, webSocket: client });
}
