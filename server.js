const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
// Needed when hosted behind Render / Railway / Fly (HTTPS proxy)
app.set("trust proxy", 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.get("/health", (req, res) => {
  res.type("text").send("ok");
});

app.use(express.static(path.join(__dirname, "public")));

function randomRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** roomId -> { players: Map<socketId, { name }>, game: string|null, ttt, rps } */
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: new Map(),
      game: null,
      ttt: { board: Array(9).fill(null), turn: "X", winner: null },
      rps: {
        round: 1,
        scores: [0, 0],
        picks: [null, null],
        phase: "pick",
      },
      drawGuess: {
        scores: [0, 0],
        drawerTurn: 0,
        phase: "idle",
        secret: null,
        pickOptions: null,
        drawTimer: null,
        drawEndsAt: 0,
      },
    });
  }
  return rooms.get(roomId);
}

function roomPlayerList(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({ id, name: p.name }));
}

function broadcastLobby(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("lobbyUpdate", {
    players: roomPlayerList(room),
    game: room.game,
    canStart: room.players.size >= 2,
  });
}

function cleanupEmptyRooms() {
  for (const [id, room] of rooms.entries()) {
    if (room.players.size === 0) rooms.delete(id);
  }
}

const DRAW_GUESS_WORDS = [
  "cat",
  "dog",
  "sun",
  "tree",
  "house",
  "car",
  "fish",
  "apple",
  "ball",
  "star",
  "moon",
  "heart",
  "bird",
  "flower",
  "cake",
  "book",
  "phone",
  "shoe",
  "hat",
  "key",
  "boat",
  "plane",
  "rain",
  "snow",
  "clock",
];
const DRAW_GUESS_MS = 45000;
const DRAW_GUESS_WIN = 3;

function shuffleWords(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeGuess(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function clearDrawGuessTimers(room) {
  if (room?.drawGuess?.drawTimer) {
    clearTimeout(room.drawGuess.drawTimer);
    room.drawGuess.drawTimer = null;
  }
}

function buildDrawGuessPublic(room, ids) {
  const dg = room.drawGuess;
  const drawerId = ids[dg.drawerTurn % 2];
  const guesserId = ids[1 - (dg.drawerTurn % 2)];
  return {
    phase: dg.phase,
    scores: [...dg.scores],
    drawerTurn: dg.drawerTurn,
    drawerId,
    guesserId,
    endsAt: dg.drawEndsAt || 0,
  };
}

function startDrawGuessRound(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.game !== "drawGuess") return;
  const dg = room.drawGuess;
  clearDrawGuessTimers(room);
  const ids = Array.from(room.players.keys());
  if (ids.length < 2) return;

  if (dg.scores[0] >= DRAW_GUESS_WIN || dg.scores[1] >= DRAW_GUESS_WIN) {
    dg.phase = "done";
    io.to(roomId).emit("drawGuessState", buildDrawGuessPublic(room, ids));
    return;
  }

  dg.phase = "pick";
  dg.secret = null;
  dg.drawEndsAt = 0;
  dg.pickOptions = shuffleWords([...DRAW_GUESS_WORDS]).slice(0, 3);
  const drawerId = ids[dg.drawerTurn % 2];

  io.to(roomId).emit("drawCanvasClear");
  io.to(roomId).emit("drawGuessState", buildDrawGuessPublic(room, ids));
  io.to(drawerId).emit("drawPickWords", { words: dg.pickOptions });
}

function endDrawGuessRound(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room || room.game !== "drawGuess") return;
  const dg = room.drawGuess;
  clearDrawGuessTimers(room);
  const ids = Array.from(room.players.keys());
  if (ids.length < 2) return;

  const drawerIdx = dg.drawerTurn % 2;
  const guesserIdx = 1 - drawerIdx;
  const secret = dg.secret || "";

  if (reason === "correct") {
    dg.scores[guesserIdx]++;
  } else if (reason === "timeout") {
    dg.scores[drawerIdx]++;
  }

  dg.phase = "result";
  io.to(roomId).emit("drawGuessState", buildDrawGuessPublic(room, ids));
  io.to(roomId).emit("drawGuessResult", {
    reason,
    word: secret,
    scores: [...dg.scores],
  });

  setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.game !== "drawGuess") return;
    const idList = Array.from(r.players.keys());
    if (idList.length < 2) return;
    if (r.drawGuess.scores[0] >= DRAW_GUESS_WIN || r.drawGuess.scores[1] >= DRAW_GUESS_WIN) {
      r.drawGuess.phase = "done";
      io.to(roomId).emit("drawGuessState", buildDrawGuessPublic(r, idList));
      return;
    }
    r.drawGuess.drawerTurn++;
    startDrawGuessRound(roomId);
  }, 3200);
}

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("createRoom", (playerName, cb) => {
    cleanupEmptyRooms();
    let roomId = randomRoomId();
    while (rooms.has(roomId)) roomId = randomRoomId();
    const room = getRoom(roomId);
    const name = (playerName || "Player").slice(0, 12) || "Player";
    room.players.set(socket.id, { name });
    socket.join(roomId);
    currentRoom = roomId;
    socket.emit("joinedRoom", { roomId, youAreHost: true });
    broadcastLobby(roomId);
    cb?.({ ok: true, roomId });
  });

  socket.on("joinRoom", ({ roomId, playerName }, cb) => {
    const id = String(roomId || "").toUpperCase().trim();
    if (!id || id.length !== 6) {
      cb?.({ ok: false, error: "Invalid room code" });
      return;
    }
    const room = rooms.get(id);
    if (!room) {
      cb?.({ ok: false, error: "Room not found" });
      return;
    }
    if (room.players.size >= 2) {
      cb?.({ ok: false, error: "Room is full (2 players)" });
      return;
    }
    const name = (playerName || "Player").slice(0, 12) || "Player";
    room.players.set(socket.id, { name });
    socket.join(id);
    currentRoom = id;
    socket.emit("joinedRoom", { roomId: id, youAreHost: false });
    broadcastLobby(id);
    cb?.({ ok: true, roomId: id });
  });

  socket.on("setGame", (gameId) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.players.size < 2) return;
    const ids = Array.from(room.players.keys());
    if (socket.id !== ids[0]) return;
    room.game = gameId;
    if (gameId === "ttt") {
      room.ttt = { board: Array(9).fill(null), turn: "X", winner: null };
    }
    if (gameId === "rps") {
      room.rps = { round: 1, scores: [0, 0], picks: [null, null], phase: "pick" };
    }
    if (gameId === "drawGuess") {
      clearDrawGuessTimers(room);
      room.drawGuess = {
        scores: [0, 0],
        drawerTurn: 0,
        phase: "pick",
        secret: null,
        pickOptions: null,
        drawTimer: null,
        drawEndsAt: 0,
      };
    }
    io.to(currentRoom).emit("gameSelected", { game: gameId, ttt: room.ttt, rps: room.rps });
    broadcastLobby(currentRoom);
    if (gameId === "drawGuess") {
      startDrawGuessRound(currentRoom);
    }
  });

  socket.on("tttMove", (index) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.game !== "ttt" || room.ttt.winner) return;
    const ids = Array.from(room.players.keys());
    const myIndex = ids.indexOf(socket.id);
    if (myIndex === -1) return;
    const symbol = myIndex === 0 ? "X" : "O";
    if (room.ttt.turn !== symbol) return;
    const i = Number(index);
    if (i < 0 || i > 8 || room.ttt.board[i]) return;
    room.ttt.board[i] = symbol;
    const w = checkWinner(room.ttt.board);
    if (w) room.ttt.winner = w;
    else if (room.ttt.board.every(Boolean)) room.ttt.winner = "draw";
    else room.ttt.turn = symbol === "X" ? "O" : "X";
    io.to(currentRoom).emit("tttState", { ...room.ttt });
  });

  socket.on("rpsPick", (pick) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.game !== "rps") return;
    const valid = ["rock", "paper", "scissors"];
    if (!valid.includes(pick)) return;
    const ids = Array.from(room.players.keys());
    const myIndex = ids.indexOf(socket.id);
    if (myIndex === -1 || myIndex > 1) return;
    if (room.rps.phase !== "pick") return;
    room.rps.picks[myIndex] = pick;
    if (room.rps.picks[0] && room.rps.picks[1]) {
      const a = room.rps.picks[0];
      const b = room.rps.picks[1];
      const win = rpsWinner(a, b);
      if (win === 0) room.rps.scores[0]++;
      else if (win === 1) room.rps.scores[1]++;
      room.rps.phase = "reveal";
      io.to(currentRoom).emit("rpsState", { ...room.rps, lastRound: { a, b, point: win } });
      setTimeout(() => {
        if (!rooms.has(currentRoom)) return;
        const r = rooms.get(currentRoom);
        if (!r || r.game !== "rps") return;
        const max = 3;
        if (r.rps.scores[0] >= max || r.rps.scores[1] >= max) {
          r.rps.phase = "done";
          io.to(currentRoom).emit("rpsState", { ...r.rps });
          return;
        }
        r.rps.round++;
        r.rps.picks = [null, null];
        r.rps.phase = "pick";
        io.to(currentRoom).emit("rpsState", { ...r.rps });
      }, 2200);
    } else {
      io.to(currentRoom).emit("rpsState", { ...room.rps });
    }
  });

  socket.on("drawChooseWord", (word) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.game !== "drawGuess") return;
    const dg = room.drawGuess;
    if (dg.phase !== "pick") return;
    const ids = Array.from(room.players.keys());
    const drawerId = ids[dg.drawerTurn % 2];
    if (socket.id !== drawerId) return;
    const w = String(word || "")
      .trim()
      .toLowerCase();
    if (!dg.pickOptions || !dg.pickOptions.map((x) => String(x).toLowerCase()).includes(w)) return;
    dg.secret = dg.pickOptions.find((x) => String(x).toLowerCase() === w) || word;
    dg.pickOptions = null;
    dg.phase = "drawing";
    dg.drawEndsAt = Date.now() + DRAW_GUESS_MS;
    io.to(currentRoom).emit("drawCanvasClear");
    io.to(currentRoom).emit("drawGuessState", buildDrawGuessPublic(room, ids));
    if (dg.drawTimer) clearTimeout(dg.drawTimer);
    dg.drawTimer = setTimeout(() => {
      endDrawGuessRound(currentRoom, "timeout");
    }, DRAW_GUESS_MS);
  });

  socket.on("drawStroke", (payload) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.game !== "drawGuess" || room.drawGuess.phase !== "drawing") return;
    const ids = Array.from(room.players.keys());
    const drawerId = ids[room.drawGuess.drawerTurn % 2];
    if (socket.id !== drawerId) return;
    if (!payload || typeof payload !== "object") return;
    socket.to(currentRoom).emit("drawStroke", payload);
  });

  socket.on("drawSubmitGuess", (raw) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.game !== "drawGuess") return;
    const dg = room.drawGuess;
    if (dg.phase !== "drawing") return;
    const ids = Array.from(room.players.keys());
    const guesserId = ids[1 - (dg.drawerTurn % 2)];
    if (socket.id !== guesserId) return;
    const g = normalizeGuess(String(raw || ""));
    const s = normalizeGuess(dg.secret || "");
    if (g && g === s) {
      endDrawGuessRound(currentRoom, "correct");
    } else {
      socket.emit("drawGuessWrong", { message: "Not quite — try again!" });
    }
  });

  socket.on("resetToLobby", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    clearDrawGuessTimers(room);
    room.game = null;
    io.to(currentRoom).emit("backToLobby");
    broadcastLobby(currentRoom);
  });

  socket.on("leaveRoom", () => {
    leaveCurrent(socket);
  });

  function leaveCurrent(sock) {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      clearDrawGuessTimers(room);
      room.players.delete(sock.id);
      room.game = null;
      sock.leave(currentRoom);
      io.to(currentRoom).emit("playerLeft");
      io.to(currentRoom).emit("backToLobby");
      broadcastLobby(currentRoom);
      if (room.players.size === 0) rooms.delete(currentRoom);
    }
    currentRoom = null;
  }

  socket.on("disconnect", () => {
    leaveCurrent(socket);
  });
});

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

/** 0 = first wins, 1 = second wins, -1 = tie */
function rpsWinner(a, b) {
  if (a === b) return -1;
  const beats = { rock: "scissors", scissors: "paper", paper: "rock" };
  return beats[a] === b ? 0 : 1;
}

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, "0.0.0.0", () => {
  const publicUrl = process.env.PUBLIC_URL || "";
  console.log(`Game hub running on port ${PORT}`);
  if (publicUrl) console.log(`Public URL (bookmark this): ${publicUrl}`);
  else {
    console.log(`Local: http://localhost:${PORT}`);
    console.log("Same Wi‑Fi phone: http://<your-PC-IP>:" + PORT);
    console.log("Play anywhere: deploy online — see README.md or DEPLOY.md");
  }
});
