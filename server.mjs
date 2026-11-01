import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

// 生产模式：同一个端口既提供网页（dist 目录）又提供联机，手机只需要打开一个网址。
const DIST_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const httpServer = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url || "/", "http://localhost");
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("ok");
    }
    const safePath = normalize(decodeURIComponent(pathname)).replace(/^([/\\]*\.\.)+/, "");
    let file = join(DIST_DIR, safePath);
    if (!file.startsWith(DIST_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(DIST_DIR, "index.html");
    const body = await readFile(file);
    const isAsset = file.includes(`${join(DIST_DIR, "assets")}`);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("网页还没有构建。请先运行：npm run build，然后再运行：npm start");
  }
});
const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

const rooms = new Map();
const socketToPlayer = new Map();
const tokenToPlayer = new Map();
const disconnectTimers = new Map();
const MAX_PLAYERS = 8;
const RECONNECT_GRACE_MS = 30_000;
const AVATARS = ["🐱", "🐼", "🐸", "🐰", "🦊", "🐻", "🐯", "🐨"];
const MAX_ROUNDS = 12;
const WORD_QUESTIONS = [
  "说到夏天，你会想到什么？",
  "说到旅行，你会想到什么？",
  "说到放学后，你会想到什么？",
  "说到海边，你会想到什么？",
  "说到周末，你会想到什么？",
  "说到深夜，你会想到什么？",
  "说到童年，你会想到什么？",
  "说到幸福，你会想到什么？",
  "说到下雨天，你会想到什么？",
  "说到美食，你会想到什么？",
  "说到冬天，你会想到什么？",
  "说到自由，你会想到什么？",
];

// 默契问答：每题给 4 个选项，大家选同一个就算默契。
const QUIZ_QUESTIONS = [
  { q: "如果可以立刻出发旅行，你最想去哪里？", options: ["海边", "雪山", "古城小镇", "繁华大都市"] },
  { q: "你觉得和朋友一起最适合做什么？", options: ["吃火锅", "打游戏", "看电影", "说走就走去旅行"] },
  { q: "哪种小事最容易让你开心？", options: ["吃到好吃的", "睡个懒觉", "收到朋友的消息", "下雨天窝在家"] },
  { q: "如果今天不用工作或学习，你最想做什么？", options: ["睡到自然醒", "出门玩一整天", "追剧打游戏", "吃一顿大餐"] },
  { q: "什么食物最能代表你的快乐？", options: ["火锅", "奶茶", "烧烤", "甜品"] },
  { q: "你理想中的周末是什么样的？", options: ["宅在家", "郊外走走", "逛街吃饭", "朋友聚会"] },
  { q: "如果能拥有一种超能力，你会选什么？", options: ["瞬间移动", "隐身", "读心", "飞行"] },
  { q: "你最想重温哪一种时光？", options: ["童年", "校园时代", "第一次旅行", "和朋友熬夜聊天"] },
  { q: "什么地方最容易让你放松下来？", options: ["自己的床上", "海边", "咖啡馆", "大自然里"] },
  { q: "如果有一张免费机票，你会飞去哪里？", options: ["日本", "欧洲", "海岛", "北极看极光"] },
  { q: "你最希望朋友懂你的哪一点？", options: ["我的情绪", "我的喜好", "我的梦想", "我的小习惯"] },
  { q: "夏天你最想来一杯什么？", options: ["冰奶茶", "汽水", "冰美式", "西瓜汁"] },
];

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 每局开始时洗牌，保证一局里题目不重复。
function buildDeck(mode) {
  return shuffled(mode === "quiz" ? QUIZ_QUESTIONS : WORD_QUESTIONS);
}

function drawQuestion(room) {
  if (!room.deck.length) room.deck = buildDeck(room.mode);
  const item = room.deck.pop();
  if (room.mode === "quiz") {
    room.question = item.q;
    room.options = item.options;
  } else {
    room.question = item;
    room.options = [];
  }
}

function normalizeAnswer(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function snapshot(room) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    phase: room.phase,
    mode: room.mode,
    seconds: room.seconds,
    question: room.question,
    options: room.options,
    deadline: room.deadline,
    serverNow: Date.now(),
    revealed: room.revealed,
    round: room.round,
    maxRounds: MAX_ROUNDS,
    history: room.history,
    finishReason: room.finishReason,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      host: player.id === room.hostId,
      answer: room.answers.get(player.id) || "",
      connected: Boolean(player.socketId),
    })),
  };
}

function publish(room) {
  io.to(room.code).emit("room:update", snapshot(room));
}

function clearRoundTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.deadline = null;
}

// 每一轮开始时启动服务器端倒计时；时间到了没提交的人记为“未回答”，自动揭晓。
function startRoundTimer(room) {
  clearRoundTimer(room);
  room.deadline = Date.now() + room.seconds * 1000;
  const round = room.round;
  room.timer = setTimeout(() => {
    room.timer = null;
    if (room.phase !== "game" || room.revealed || room.round !== round) return;
    revealRound(room);
    publish(room);
  }, room.seconds * 1000 + 300);
}

// 封存本轮结果（缺答案的玩家记为空），并判断整局是否结束。
function revealRound(room) {
  if (room.phase !== "game" || room.revealed || room.players.size === 0) return false;
  clearRoundTimer(room);
  const roundAnswers = [...room.players.values()].map((player) => ({
    playerId: player.id,
    name: player.name,
    avatar: player.avatar,
    answer: room.answers.get(player.id) || "",
  }));
  room.revealed = true;
  const allMatch = roundAnswers.length > 0 && roundAnswers.every(
    (item) => item.answer && normalizeAnswer(item.answer) === normalizeAnswer(roundAnswers[0].answer),
  );
  room.history.push({
    round: room.round,
    question: room.question,
    options: room.options,
    answers: roundAnswers,
    allMatch,
  });

  if (allMatch) {
    room.phase = "finished";
    room.finishReason = "match";
  } else if (room.round >= MAX_ROUNDS) {
    room.phase = "finished";
    room.finishReason = "max-rounds";
  }
  return true;
}

// 所有人都提交后提前揭晓。
function resolveRoundIfComplete(room) {
  if (room.phase !== "game" || room.revealed || room.players.size === 0) return false;
  const complete = [...room.players.values()].every((player) => room.answers.has(player.id));
  return complete ? revealRound(room) : false;
}

function findRoomBySocket(socketId) {
  const playerId = socketToPlayer.get(socketId);
  if (!playerId) return null;
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function clearDisconnectTimer(playerId) {
  const timer = disconnectTimers.get(playerId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(playerId);
}

function removePlayer(room, playerId, announce = true) {
  const player = room.players.get(playerId);
  if (!player) return;
  clearDisconnectTimer(playerId);
  if (player.socketId) socketToPlayer.delete(player.socketId);
  tokenToPlayer.delete(player.token);
  room.players.delete(playerId);
  room.answers.delete(playerId);

  if (room.players.size === 0) {
    clearRoundTimer(room);
    rooms.delete(room.code);
    if (announce) io.to(room.code).emit("room:closed", "房间已关闭，所有玩家都已离开。");
    return;
  }

  if (room.hostId === playerId) {
    const nextPlayer = room.players.values().next().value;
    room.hostId = nextPlayer.id;
  }
  resolveRoundIfComplete(room);
  publish(room);
}

function leaveCurrentRoom(socket, announce = true) {
  const room = findRoomBySocket(socket.id);
  const playerId = socketToPlayer.get(socket.id);
  if (!room || !playerId) return null;
  const player = room.players.get(playerId);
  if (player) player.socketId = null;
  socketToPlayer.delete(socket.id);
  socket.leave(room.code);
  removePlayer(room, playerId, announce);
  return room;
}

function fail(ack, error) {
  if (typeof ack === "function") ack({ ok: false, error });
}

function cleanName(name) {
  return String(name || "玩家").trim().slice(0, 16) || "玩家";
}

function attachPlayer(socket, room, player) {
  clearDisconnectTimer(player.id);
  if (player.socketId && player.socketId !== socket.id) {
    socketToPlayer.delete(player.socketId);
    const oldSocket = io.sockets.sockets.get(player.socketId);
    if (oldSocket) oldSocket.leave(room.code);
  }
  player.socketId = socket.id;
  socketToPlayer.set(socket.id, player.id);
  socket.join(room.code);
}

io.on("connection", (socket) => {
  socket.on("room:resume", ({ token } = {}, ack) => {
    const saved = tokenToPlayer.get(String(token || ""));
    if (!saved) {
      if (typeof ack === "function") ack({ ok: false, error: "没有找到可恢复的房间。" });
      return;
    }
    const room = rooms.get(saved.roomCode);
    const player = room?.players.get(saved.playerId);
    if (!room || !player || player.token !== token) {
      tokenToPlayer.delete(String(token || ""));
      if (typeof ack === "function") ack({ ok: false, error: "房间已不存在，请重新创建或加入。" });
      return;
    }
    attachPlayer(socket, room, player);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room), playerId: player.id });
  });

  socket.on("room:create", ({ name, token } = {}, ack) => {
    leaveCurrentRoom(socket);
    const playerToken = String(token || "");
    if (!playerToken) return fail(ack, "玩家身份初始化失败，请刷新页面重试。");
    const code = makeCode();
    const playerId = randomUUID();
    const player = {
      id: playerId,
      token: playerToken,
      name: cleanName(name),
      avatar: AVATARS[0],
      socketId: socket.id,
    };
    const room = {
      code,
      name: "朋友的默契小屋",
      hostId: playerId,
      phase: "lobby",
      mode: "word",
      seconds: 60,
      question: "",
      options: [],
      deck: [],
      timer: null,
      deadline: null,
      revealed: false,
      round: 0,
      history: [],
      finishReason: null,
      players: new Map([[playerId, player]]),
      answers: new Map(),
    };
    drawQuestion(room);
    rooms.set(code, room);
    tokenToPlayer.set(playerToken, { roomCode: code, playerId });
    socketToPlayer.set(socket.id, playerId);
    socket.join(code);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room), playerId });
  });

  socket.on("room:join", ({ code, name, token } = {}, ack) => {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room) return fail(ack, "没有找到这个房间，请检查邀请码是否正确。");
    const playerToken = String(token || "");
    if (!playerToken) return fail(ack, "玩家身份初始化失败，请刷新页面重试。");

    const existing = tokenToPlayer.get(playerToken);
    if (existing) {
      const existingRoom = rooms.get(existing.roomCode);
      const existingPlayer = existingRoom?.players.get(existing.playerId);
      if (existingRoom && existingPlayer && existingRoom.code === room.code) {
        attachPlayer(socket, room, existingPlayer);
        publish(room);
        if (typeof ack === "function") ack({ ok: true, room: snapshot(room), playerId: existingPlayer.id });
        return;
      }
      if (existingRoom && existingPlayer && room.players.size >= MAX_PLAYERS) {
        return fail(ack, "这个房间已经满 8 人啦。");
      }
      if (existingRoom && existingPlayer) removePlayer(existingRoom, existingPlayer.id);
    }

    if (room.players.size >= MAX_PLAYERS) return fail(ack, "这个房间已经满 8 人啦。");
    leaveCurrentRoom(socket);
    const playerId = randomUUID();
    const player = {
      id: playerId,
      token: playerToken,
      name: cleanName(name),
      avatar: AVATARS[room.players.size % AVATARS.length],
      socketId: socket.id,
    };
    room.players.set(playerId, player);
    tokenToPlayer.set(playerToken, { roomCode: room.code, playerId });
    socketToPlayer.set(socket.id, playerId);
    socket.join(room.code);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room), playerId });
  });

  socket.on("room:settings", (settings = {}, ack) => {
    const room = findRoomBySocket(socket.id);
    const playerId = socketToPlayer.get(socket.id);
    if (!room || !playerId) return fail(ack, "你还没有加入房间。");
    if (room.hostId !== playerId) return fail(ack, "只有房主可以修改游戏设置。");
    if (room.phase !== "lobby") return fail(ack, "游戏进行中不能修改设置。");
    if (settings.mode === "word" || settings.mode === "quiz") room.mode = settings.mode;
    if ([30, 60, 90].includes(Number(settings.seconds))) room.seconds = Number(settings.seconds);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room) });
  });

  socket.on("game:start", (_payload, ack) => {
    const room = findRoomBySocket(socket.id);
    const playerId = socketToPlayer.get(socket.id);
    if (!room || !playerId) return fail(ack, "你还没有加入房间。");
    if (room.hostId !== playerId) return fail(ack, "只有房主可以开始游戏。");
    room.answers.clear();
    room.history = [];
    room.round = 1;
    room.finishReason = null;
    room.revealed = false;
    room.phase = "game";
    room.deck = buildDeck(room.mode);
    drawQuestion(room);
    startRoundTimer(room);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room) });
  });

  socket.on("game:answer", ({ answer } = {}, ack) => {
    const room = findRoomBySocket(socket.id);
    const playerId = socketToPlayer.get(socket.id);
    if (!room || !playerId) return fail(ack, "你还没有加入房间。");
    if (room.phase !== "game") return fail(ack, "当前还没有开始这一轮游戏。");
    if (room.revealed) return fail(ack, "本轮答案已经揭晓。");
    const cleanAnswer = String(answer || "").trim().slice(0, 60);
    if (!cleanAnswer) return fail(ack, "答案不能为空。");
    if (room.mode === "quiz" && !room.options.includes(cleanAnswer)) return fail(ack, "请从选项里选择一个答案。");
    // 每位玩家每轮只能提交一次，避免提前看到答案后反复修改。
    if (room.answers.has(playerId)) return fail(ack, "你已经提交过本轮答案啦，请等待其他玩家。");
    room.answers.set(playerId, cleanAnswer);

    // 最后一位玩家提交后自动揭晓，并记录本轮结果。
    resolveRoundIfComplete(room);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room) });
  });

  socket.on("game:next-round", (_payload, ack) => {
    const room = findRoomBySocket(socket.id);
    const playerId = socketToPlayer.get(socket.id);
    if (!room || !playerId) return fail(ack, "你还没有加入房间。");
    if (room.hostId !== playerId) return fail(ack, "请让房主开始下一轮。");
    if (room.phase !== "game" || !room.revealed) return fail(ack, "请先等本轮所有玩家提交并揭晓答案。");
    if (room.history.some((item) => item.allMatch) || room.round >= MAX_ROUNDS) {
      return fail(ack, "这局游戏已经结束，请返回房间开始新的一局。");
    }

    const previousRound = room.history[room.history.length - 1];
    if (!previousRound) return fail(ack, "没有找到上一轮答案，无法继续。");
    if (room.mode === "quiz") {
      // 默契问答：每轮换一道新题。
      drawQuestion(room);
    } else {
      // 同词联想：用上一轮大家的答案作为新的联想起点。
      const seedAnswers = previousRound.answers
        .filter((item) => item.answer)
        .map((item) => `${item.name}：${item.answer}`)
        .join("；");
      room.question = seedAnswers
        ? `上一轮大家想到的是：${seedAnswers}。看到这些词，你会联想到什么？`
        : "上一轮没有人回答。换个起点：说到快乐，你会想到什么？";
    }
    room.round += 1;
    room.answers.clear();
    room.revealed = false;
    startRoundTimer(room);
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room) });
  });

  socket.on("game:back-to-lobby", (_payload, ack) => {
    const room = findRoomBySocket(socket.id);
    const playerId = socketToPlayer.get(socket.id);
    if (!room || !playerId) return fail(ack, "你还没有加入房间。");
    if (room.hostId !== playerId) return fail(ack, "请让房主返回房间大厅。");
    clearRoundTimer(room);
    room.phase = "lobby";
    room.revealed = false;
    room.round = 0;
    room.history = [];
    room.finishReason = null;
    room.answers.clear();
    publish(room);
    if (typeof ack === "function") ack({ ok: true, room: snapshot(room) });
  });

  socket.on("room:leave", (_payload, ack) => {
    leaveCurrentRoom(socket);
    if (typeof ack === "function") ack({ ok: true, message: "已离开房间。" });
  });

  socket.on("disconnect", () => {
    const playerId = socketToPlayer.get(socket.id);
    if (!playerId) return;
    const room = findRoomBySocket(socket.id);
    socketToPlayer.delete(socket.id);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;
    player.socketId = null;
    // 给刷新或短暂断网留出恢复窗口，不立刻删除玩家或转移房主。
    const timer = setTimeout(() => {
      disconnectTimers.delete(playerId);
      const currentRoom = rooms.get(room.code);
      const currentPlayer = currentRoom?.players.get(playerId);
      if (currentRoom && currentPlayer && !currentPlayer.socketId) {
        removePlayer(currentRoom, playerId);
      }
    }, RECONNECT_GRACE_MS);
    disconnectTimers.set(playerId, timer);
  });
});

const PORT = Number(process.env.PORT || 3001);
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Same Vibe 已启动：http://localhost:${PORT}（手机请用电脑的局域网 IP 或公网地址访问）`);
  console.log(`断线玩家将在 ${RECONNECT_GRACE_MS / 1000} 秒后清理；刷新可自动恢复房间。`);
});
