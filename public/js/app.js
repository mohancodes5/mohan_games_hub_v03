/* global io */

const $ = (id) => document.getElementById(id);

const screens = {
  home: $("screenHome"),
  howTo: $("screenHowTo"),
  soloMenu: $("screenSoloMenu"),
  draw: $("screenDraw"),
  find: $("screenFind"),
  reflex: $("screenReflex"),
  memory: $("screenMemory"),
  friends: $("screenFriends"),
  room: $("screenRoom"),
  ttt: $("screenTtt"),
  rps: $("screenRps"),
  drawGuess: $("screenDrawGuess"),
};

const btnBack = $("btnBack");
let backHandler = null;

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  screens[name].classList.add("active");

  const needsBack = !["home"].includes(name);
  btnBack.classList.toggle("hidden", !needsBack);
  backHandler = () => {
    if (name === "howTo") showScreen("home");
    else if (name === "soloMenu") showScreen("home");
    else if (name === "draw") showScreen("soloMenu");
    else if (name === "find") showScreen("soloMenu");
    else if (name === "reflex") {
      stopReflex();
      showScreen("soloMenu");
    } else if (name === "memory") showScreen("soloMenu");
    else if (name === "friends") showScreen("home");
    else if (name === "room") {
      leaveRoom();
      showScreen("friends");
    } else if (name === "ttt" || name === "rps" || name === "drawGuess") {
      if (socket?.connected) socket.emit("resetToLobby");
      showScreen("room");
    }
  };
}

btnBack.addEventListener("click", () => backHandler?.());

/* ---- Home ---- */
$("btnSolo").addEventListener("click", () => showScreen("soloMenu"));
$("btnFriends").addEventListener("click", () => showScreen("friends"));
$("btnHowTo").addEventListener("click", () => showScreen("howTo"));

/* ---- Solo: Reflex ---- */
const reflexBtn = $("reflexBtn");
const reflexHint = $("reflexHint");
const reflexResult = $("reflexResult");
let reflexState = "idle";
let reflexTimer = null;
let reflexStartWait = null;

function stopReflex() {
  clearTimeout(reflexTimer);
  reflexTimer = null;
  reflexState = "idle";
  reflexBtn.className = "reflex-target";
  reflexBtn.textContent = "Start";
  reflexHint.textContent = "Tap “Start” — then tap as soon as the button turns green.";
}

/* ---- Solo: Free draw (no time limit) ---- */
const drawCanvas = $("drawCanvas");
let drawCtx = null;
let drawActive = false;
let drawLast = null;

function getDrawStyle() {
  return {
    color: $("drawColor").value,
    size: Number($("drawSize").value) || 5,
  };
}

function resizeDrawCanvas() {
  if (!drawCanvas) return;
  const wrap = drawCanvas.parentElement;
  const w = Math.max(280, Math.min(400, wrap.clientWidth || 360));
  const h = Math.max(260, Math.min(440, Math.floor(window.innerHeight * 0.42)));
  const dpr = window.devicePixelRatio || 1;
  drawCanvas.width = Math.floor(w * dpr);
  drawCanvas.height = Math.floor(h * dpr);
  drawCanvas.style.width = `${w}px`;
  drawCanvas.style.height = `${h}px`;
  drawCtx = drawCanvas.getContext("2d");
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.fillStyle = "#121214";
  drawCtx.fillRect(0, 0, w, h);
}

function drawLineTo(x, y) {
  if (!drawCtx) return;
  const { color, size } = getDrawStyle();
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = size;
  drawCtx.beginPath();
  if (drawLast) {
    drawCtx.moveTo(drawLast.x, drawLast.y);
    drawCtx.lineTo(x, y);
  } else {
    drawCtx.moveTo(x, y);
    drawCtx.lineTo(x, y);
  }
  drawCtx.stroke();
  drawLast = { x, y };
}

function canvasCoords(e) {
  const r = drawCanvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  return { x, y };
}

function initDrawScreen() {
  resizeDrawCanvas();
  drawLast = null;
}

drawCanvas.addEventListener("pointerdown", (e) => {
  if (e.target !== drawCanvas) return;
  e.preventDefault();
  drawCanvas.setPointerCapture(e.pointerId);
  drawActive = true;
  drawLast = null;
  const { x, y } = canvasCoords(e);
  const { color, size } = getDrawStyle();
  drawCtx.fillStyle = color;
  drawCtx.beginPath();
  drawCtx.arc(x, y, Math.max(1, size / 2), 0, Math.PI * 2);
  drawCtx.fill();
  drawLast = { x, y };
});

drawCanvas.addEventListener("pointermove", (e) => {
  if (!drawActive) return;
  e.preventDefault();
  const { x, y } = canvasCoords(e);
  drawLineTo(x, y);
});

function endDrawPointer(e) {
  if (!drawActive) return;
  try {
    drawCanvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  drawActive = false;
  drawLast = null;
}

drawCanvas.addEventListener("pointerup", endDrawPointer);
drawCanvas.addEventListener("pointercancel", endDrawPointer);

$("btnDrawClear").addEventListener("click", () => {
  if (!drawCtx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = drawCanvas.width / dpr;
  const h = drawCanvas.height / dpr;
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCtx.fillStyle = "#121214";
  drawCtx.fillRect(0, 0, w, h);
});

$("btnDraw").addEventListener("click", () => {
  showScreen("draw");
  requestAnimationFrame(() => initDrawScreen());
});

window.addEventListener("resize", () => {
  if (screens.draw.classList.contains("active")) initDrawScreen();
});

/* ---- Solo: Find them all (no time limit) ---- */
const FIND_POOL = ["🐱", "🐶", "🦊", "🐰", "🐻", "🐼", "🦁", "🐸", "🐵", "⭐", "🌙", "☀️", "🍎", "🍌", "🚗", "⚽", "🎈", "🎁", "🍕", "🌸"];
let findTarget = "";
let findTotal = 0;
let findFound = 0;

function buildFindBoard() {
  const grid = $("findGrid");
  grid.innerHTML = "";
  $("findMsg").textContent = "";

  const shuffled = shuffle([...FIND_POOL]);
  findTarget = shuffled[0];
  const decoys = shuffled.slice(1, 9);
  findTotal = 6 + Math.floor(Math.random() * 5);
  const cells = 30;
  const positions = shuffle([...Array(cells).keys()]).slice(0, findTotal);
  const setPos = new Set(positions);

  $("findTargetEmoji").textContent = findTarget;
  findFound = 0;
  $("findProgress").textContent = `Found: 0 / ${findTotal}`;

  for (let i = 0; i < cells; i++) {
    const emoji = setPos.has(i) ? findTarget : decoys[Math.floor(Math.random() * decoys.length)];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "find-cell";
    b.textContent = emoji;
    b.dataset.index = String(i);
    b.dataset.isTarget = setPos.has(i) ? "1" : "0";
    b.addEventListener("click", onFindClick);
    grid.appendChild(b);
  }
}

function onFindClick(e) {
  const b = e.currentTarget;
  if (b.classList.contains("found") || b.classList.contains("wrong-lock")) return;

  if (b.dataset.isTarget === "1") {
    b.classList.add("found");
    findFound++;
    $("findProgress").textContent = `Found: ${findFound} / ${findTotal}`;
    if (findFound >= findTotal) {
      $("findMsg").textContent = "You found them all! Tap “New board” anytime.";
    }
  } else {
    b.classList.add("wrong");
    b.classList.add("wrong-lock");
    setTimeout(() => {
      b.classList.remove("wrong");
      b.classList.remove("wrong-lock");
    }, 400);
  }
}

$("btnFind").addEventListener("click", () => {
  buildFindBoard();
  showScreen("find");
});

$("btnFindNew").addEventListener("click", () => buildFindBoard());

$("btnReflex").addEventListener("click", () => {
  stopReflex();
  reflexResult.textContent = "";
  showScreen("reflex");
});

reflexBtn.addEventListener("click", () => {
  if (reflexState === "idle") {
    reflexState = "wait";
    reflexResult.textContent = "";
    reflexBtn.className = "reflex-target wait";
    reflexBtn.textContent = "Wait…";
    reflexHint.textContent = "Get ready…";
    const delay = 1500 + Math.random() * 2500;
    reflexStartWait = performance.now();
    reflexTimer = setTimeout(() => {
      reflexState = "go";
      reflexBtn.className = "reflex-target go";
      reflexBtn.textContent = "TAP!";
      reflexHint.textContent = "Now!";
      reflexTimer = null;
    }, delay);
    return;
  }
  if (reflexState === "wait") {
    clearTimeout(reflexTimer);
    reflexTimer = null;
    reflexState = "tooSoon";
    reflexBtn.className = "reflex-target too-soon";
    reflexBtn.textContent = "Too early";
    reflexHint.textContent = "You tapped before green. Tap to try again.";
    return;
  }
  if (reflexState === "go") {
    const ms = Math.round(performance.now() - reflexStartWait);
    reflexResult.textContent = `Time: ${ms} ms — tap button to play again`;
    reflexState = "idle";
    reflexBtn.className = "reflex-target";
    reflexBtn.textContent = "Again";
    reflexHint.textContent = "Nice! Tap “Again” for another round.";
    return;
  }
  if (reflexState === "tooSoon") {
    stopReflex();
    reflexResult.textContent = "";
    reflexHint.textContent = "Tap “Start” when you’re ready.";
  }
});

/* ---- Solo: Memory ---- */
const SYMBOLS = ["🎮", "⭐", "🎯", "🎵", "🚀", "💎", "🌟", "🎲"];
let memoryMoves = 0;
let memoryFlipped = [];
let memoryLock = false;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildMemory() {
  const pairs = [...SYMBOLS, ...SYMBOLS];
  const deck = shuffle(pairs);
  const grid = $("memoryGrid");
  grid.innerHTML = "";
  memoryMoves = 0;
  memoryFlipped = [];
  memoryLock = false;
  $("memoryStats").textContent = "Moves: 0";
  $("memoryMsg").textContent = "";

  deck.forEach((sym, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "memory-card";
    b.dataset.index = String(i);
    b.dataset.symbol = sym;
    b.innerHTML = `<span class="front">${sym}</span><span class="back">?</span>`;
    b.addEventListener("click", onMemoryClick);
    grid.appendChild(b);
  });
}

function onMemoryClick(e) {
  const b = e.currentTarget;
  if (memoryLock || b.classList.contains("matched") || b.classList.contains("flipped")) return;
  b.classList.add("flipped");
  memoryFlipped.push(b);
  if (memoryFlipped.length < 2) return;
  memoryMoves++;
  $("memoryStats").textContent = `Moves: ${memoryMoves}`;
  const [c1, c2] = memoryFlipped;
  memoryLock = true;
  if (c1.dataset.symbol === c2.dataset.symbol) {
    c1.classList.add("matched");
    c2.classList.add("matched");
    memoryFlipped = [];
    memoryLock = false;
    const left = document.querySelectorAll(".memory-card:not(.matched)").length;
    if (left === 0) $("memoryMsg").textContent = `You won in ${memoryMoves} moves!`;
  } else {
    setTimeout(() => {
      c1.classList.remove("flipped");
      c2.classList.remove("flipped");
      memoryFlipped = [];
      memoryLock = false;
    }, 700);
  }
}

$("btnMemory").addEventListener("click", () => {
  buildMemory();
  showScreen("memory");
});

/* ---- Socket / Friends ---- */
const socket = io({ transports: ["websocket", "polling"] });
let roomId = null;
let isHost = false;
let lobbyPlayers = [];

function playerName() {
  return ($("inputName").value || "Player").trim().slice(0, 12) || "Player";
}

function leaveRoom() {
  roomId = null;
  isHost = false;
  socket.emit("leaveRoom");
}

$("btnShowJoin").addEventListener("click", () => {
  $("joinPanel").classList.remove("hidden");
});

$("btnCreateRoom").addEventListener("click", () => {
  $("joinError").textContent = "";
  socket.emit("createRoom", playerName(), (res) => {
    if (res?.ok) {
      roomId = res.roomId;
      isHost = true;
      $("displayRoomId").textContent = roomId;
      $("hostGamePick").classList.add("hidden");
      showScreen("room");
    }
  });
});

$("btnJoinRoom").addEventListener("click", () => {
  const code = $("inputRoom").value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  $("joinError").textContent = "";
  if (code.length !== 6) {
    $("joinError").textContent = "Enter the 6-character code.";
    return;
  }
  socket.emit("joinRoom", { roomId: code, playerName: playerName() }, (res) => {
    if (!res?.ok) {
      $("joinError").textContent = res?.error || "Could not join.";
      return;
    }
    roomId = res.roomId;
    isHost = false;
    $("displayRoomId").textContent = roomId;
    showScreen("room");
  });
});

$("btnCopyCode").addEventListener("click", async () => {
  const t = $("displayRoomId").textContent.trim();
  try {
    await navigator.clipboard.writeText(t);
    $("btnCopyCode").textContent = "Copied!";
    setTimeout(() => ($("btnCopyCode").textContent = "Copy code"), 1500);
  } catch {
    $("joinError").textContent = "Copy manually: " + t;
  }
});

$("btnLeaveRoom").addEventListener("click", () => {
  leaveRoom();
  showScreen("friends");
});

function renderLobby(data) {
  lobbyPlayers = data.players || [];
  const lines = lobbyPlayers.map((p) => p.name).join(" vs ");
  $("roomPlayers").textContent = lobbyPlayers.length ? `Players: ${lines}` : "";
  const full = data.canStart;
  $("roomStatus").textContent = full ? "Both connected — host picks a game." : "Waiting for friend to join…";
  $("hostGamePick").classList.toggle("hidden", !(isHost && full));
}

socket.on("joinedRoom", (data) => {
  roomId = data.roomId;
  isHost = data.youAreHost;
  $("displayRoomId").textContent = roomId;
});

socket.on("lobbyUpdate", (data) => {
  renderLobby(data);
});

socket.on("playerLeft", () => {
  $("roomStatus").textContent = "Friend disconnected. Waiting…";
  $("hostGamePick").classList.add("hidden");
});

socket.on("gameSelected", (payload) => {
  if (payload.game === "ttt") {
    setupTtt(payload.ttt);
    showScreen("ttt");
  }
  if (payload.game === "rps") {
    setupRps(payload.rps);
    showScreen("rps");
  }
  if (payload.game === "drawGuess") {
    hideDrawWordModal();
    showScreen("drawGuess");
    requestAnimationFrame(() => initMpDrawCanvas());
  }
});

socket.on("backToLobby", () => {
  hideDrawWordModal();
  stopDgTimer();
  $("hostGamePick").classList.remove("hidden");
  showScreen("room");
});

/* ---- Tic-tac-toe ---- */
const tttGrid = $("tttGrid");
let tttState = null;

function myTttSymbol() {
  const me = socket.id;
  const order = lobbyPlayers.map((p) => p.id);
  const idx = order.indexOf(me);
  return idx === 0 ? "X" : "O";
}

function setupTtt(state) {
  tttState = state;
  tttGrid.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "ttt-cell";
    cell.dataset.i = String(i);
    cell.textContent = state.board[i] || "";
    cell.disabled = !!state.board[i] || !!state.winner;
    cell.addEventListener("click", () => socket.emit("tttMove", i));
    tttGrid.appendChild(cell);
  }
  updateTttStatus();
}

function updateTttStatus() {
  if (!tttState) return;
  const sym = myTttSymbol();
  if (tttState.winner === "draw") $("tttStatus").textContent = "Draw!";
  else if (tttState.winner) {
    $("tttStatus").textContent =
      tttState.winner === sym ? "You won!" : "You lost — " + tttState.winner + " wins.";
  } else {
    $("tttStatus").textContent =
      tttState.turn === sym ? "Your turn (" + sym + ")" : "Opponent's turn…";
  }
}

socket.on("tttState", (state) => {
  tttState = state;
  setupTtt(state);
});

$("btnBackLobby").addEventListener("click", () => {
  socket.emit("resetToLobby");
  showScreen("room");
});

/* ---- RPS ---- */
const rpsStatus = $("rpsStatus");
const rpsReveal = $("rpsReveal");
const rpsScore = $("rpsScore");

function setupRps(state) {
  rpsScore.textContent = `Round ${state.round} — ${state.scores[0]} : ${state.scores[1]} (first to 3)`;
  const me = socket.id;
  const order = lobbyPlayers.map((p) => p.id);
  const myIdx = order.indexOf(me);
  const picked = state.picks[myIdx];
  const name0 = lobbyPlayers[0]?.name || "Player 1";
  const name1 = lobbyPlayers[1]?.name || "Player 2";
  if (state.phase === "done") {
    rpsStatus.textContent =
      state.scores[0] === state.scores[1]
        ? "Tie game!"
        : state.scores[0] > state.scores[1]
          ? order[0] === me
            ? "You won the match!"
            : `${name0} won the match.`
          : order[1] === me
            ? "You won the match!"
            : `${name1} won the match.`;
    setRpsButtonsDisabled(true);
    return;
  }
  if (state.phase === "reveal" && state.lastRound) {
    const { a, b, point } = state.lastRound;
    rpsReveal.textContent = `${name0}: ${a}  |  ${name1}: ${b}`;
    if (point === -1) rpsStatus.textContent = "Tie round — no point.";
    else rpsStatus.textContent = point === myIdx ? "You won the round!" : "Opponent won the round.";
    setRpsButtonsDisabled(true);
    return;
  }
  rpsReveal.textContent = "";
  rpsStatus.textContent = picked ? "Waiting for opponent…" : "Pick one:";
  setRpsButtonsDisabled(!!picked);
}

function setRpsButtonsDisabled(dis) {
  document.querySelectorAll(".rps-btn").forEach((b) => {
    b.disabled = dis;
  });
}

document.querySelectorAll(".rps-btn").forEach((b) => {
  b.addEventListener("click", () => {
    socket.emit("rpsPick", b.dataset.pick);
    setRpsButtonsDisabled(true);
    rpsStatus.textContent = "Waiting for opponent…";
  });
});

socket.on("rpsState", (state) => {
  setupRps(state);
});

$("btnBackLobby2").addEventListener("click", () => {
  socket.emit("resetToLobby");
  showScreen("room");
});

/* ---- Draw & guess (multiplayer) ---- */
const mpDrawCanvas = $("mpDrawCanvas");
const drawWordModal = $("drawWordModal");
const drawWordChoices = $("drawWordChoices");
let mpDrawCtx = null;
let mpDrawing = false;
let mpLastNorm = null;
let dgTimerId = null;
let dgEndsAt = 0;
let dgAmDrawer = false;

function hideDrawWordModal() {
  drawWordModal.classList.add("hidden");
  drawWordModal.setAttribute("aria-hidden", "true");
  drawWordChoices.innerHTML = "";
}

function showDrawWordModal(words) {
  drawWordChoices.innerHTML = "";
  words.forEach((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "modal-choice-btn";
    b.textContent = w;
    b.addEventListener("click", () => {
      socket.emit("drawChooseWord", w);
      hideDrawWordModal();
    });
    drawWordChoices.appendChild(b);
  });
  drawWordModal.classList.remove("hidden");
  drawWordModal.setAttribute("aria-hidden", "false");
}

function initMpDrawCanvas() {
  if (!mpDrawCanvas) return;
  const wrap = mpDrawCanvas.parentElement;
  const w = Math.max(280, Math.min(400, wrap.clientWidth || 360));
  const h = Math.max(240, Math.min(380, Math.floor(window.innerHeight * 0.36)));
  const dpr = window.devicePixelRatio || 1;
  mpDrawCanvas.width = Math.floor(w * dpr);
  mpDrawCanvas.height = Math.floor(h * dpr);
  mpDrawCanvas.style.width = `${w}px`;
  mpDrawCanvas.style.height = `${h}px`;
  mpDrawCtx = mpDrawCanvas.getContext("2d");
  mpDrawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mpDrawCtx.lineCap = "round";
  mpDrawCtx.lineJoin = "round";
  mpDrawCtx.fillStyle = "#121214";
  mpDrawCtx.fillRect(0, 0, w, h);
}

function clearMpDrawCanvas() {
  if (!mpDrawCtx || !mpDrawCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const lw = mpDrawCanvas.width / dpr;
  const lh = mpDrawCanvas.height / dpr;
  mpDrawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mpDrawCtx.fillStyle = "#121214";
  mpDrawCtx.fillRect(0, 0, lw, lh);
}

function mpNormFromEvent(e) {
  const r = mpDrawCanvas.getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * 1000);
  const y = Math.round(((e.clientY - r.top) / Math.max(1, r.height)) * 1000);
  return { x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(1000, y)) };
}

function mpBrushNorm() {
  return Number($("dgBrush").value) || 6;
}

function emitStroke(payload) {
  socket.emit("drawStroke", payload);
}

function localStrokeFromPointer(e, t) {
  const n = mpNormFromEvent(e);
  const c = $("dgColor").value;
  const lw = mpBrushNorm();
  if (t === "d") {
    mpLastNorm = n;
    const r = mpDrawCanvas.getBoundingClientRect();
    const px = (n.x / 1000) * r.width;
    const py = (n.y / 1000) * r.height;
    mpDrawCtx.strokeStyle = c;
    mpDrawCtx.fillStyle = c;
    mpDrawCtx.lineWidth = Math.max(1, (lw / 100) * Math.min(r.width, r.height) * 0.12);
    mpDrawCtx.beginPath();
    mpDrawCtx.arc(px, py, mpDrawCtx.lineWidth / 2, 0, Math.PI * 2);
    mpDrawCtx.fill();
    mpDrawCtx.beginPath();
    mpDrawCtx.moveTo(px, py);
    emitStroke({ t: "d", x: n.x, y: n.y, c, lw });
  } else if (t === "m" && mpLastNorm) {
    const r = mpDrawCanvas.getBoundingClientRect();
    const px = (n.x / 1000) * r.width;
    const py = (n.y / 1000) * r.height;
    mpDrawCtx.strokeStyle = c;
    mpDrawCtx.lineWidth = Math.max(1, (lw / 100) * Math.min(r.width, r.height) * 0.12);
    mpDrawCtx.lineTo(px, py);
    mpDrawCtx.stroke();
    mpDrawCtx.beginPath();
    mpDrawCtx.moveTo(px, py);
    mpLastNorm = n;
    emitStroke({ t: "m", x: n.x, y: n.y });
  } else if (t === "u") {
    mpLastNorm = null;
    emitStroke({ t: "u" });
  }
}

function onMpPointerDown(e) {
  if (!dgAmDrawer) return;
  e.preventDefault();
  mpDrawCanvas.setPointerCapture(e.pointerId);
  mpDrawing = true;
  localStrokeFromPointer(e, "d");
}

function onMpPointerMove(e) {
  if (!dgAmDrawer || !mpDrawing) return;
  e.preventDefault();
  localStrokeFromPointer(e, "m");
}

function onMpPointerUp(e) {
  if (!dgAmDrawer || !mpDrawing) return;
  e.preventDefault();
  try {
    mpDrawCanvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  mpDrawing = false;
  localStrokeFromPointer(e, "u");
}

let mpRemoteStroke = { lastPx: null };

function applyRemoteStroke(p) {
  if (!mpDrawCtx || !mpDrawCanvas) return;
  const r = mpDrawCanvas.getBoundingClientRect();
  const px = (p.x / 1000) * r.width;
  const py = (p.y / 1000) * r.height;
  if (p.t === "d") {
    const lw = Math.max(1, ((p.lw || 6) / 100) * Math.min(r.width, r.height) * 0.12);
    mpDrawCtx.strokeStyle = p.c || "#f8fafc";
    mpDrawCtx.fillStyle = p.c || "#f8fafc";
    mpDrawCtx.lineWidth = lw;
    mpDrawCtx.beginPath();
    mpDrawCtx.arc(px, py, lw / 2, 0, Math.PI * 2);
    mpDrawCtx.fill();
    mpDrawCtx.beginPath();
    mpDrawCtx.moveTo(px, py);
    mpRemoteStroke.lastPx = { px, py };
  } else if (p.t === "m" && mpRemoteStroke.lastPx) {
    const lw = mpDrawCtx.lineWidth || 3;
    mpDrawCtx.lineTo(px, py);
    mpDrawCtx.stroke();
    mpDrawCtx.beginPath();
    mpDrawCtx.moveTo(px, py);
    mpRemoteStroke.lastPx = { px, py };
  } else if (p.t === "u") {
    mpRemoteStroke.lastPx = null;
  }
}

function stopDgTimer() {
  if (dgTimerId) {
    clearInterval(dgTimerId);
    dgTimerId = null;
  }
  dgEndsAt = 0;
}

function startDgTimer() {
  stopDgTimer();
  const el = $("dgTimer");
  const tick = () => {
    const left = Math.max(0, Math.ceil((dgEndsAt - Date.now()) / 1000));
    el.textContent = left > 0 ? `${left}s` : "";
    el.classList.toggle("warn", left <= 15 && left > 5);
    el.classList.toggle("danger", left <= 5 && left > 0);
    if (left <= 0) el.textContent = "";
  };
  tick();
  dgTimerId = setInterval(tick, 250);
}

function updateDrawGuessUI(state) {
  const me = socket.id;
  const name0 = lobbyPlayers[0]?.name || "P1";
  const name1 = lobbyPlayers[1]?.name || "P2";
  $("dgScore").textContent = `${state.scores[0]} — ${state.scores[1]} · ${name0} vs ${name1} · First to 3`;
  $("dgWrong").textContent = "";
  $("dgResult").textContent = "";

  const drawerId = state.drawerId;
  const guesserId = state.guesserId;
  dgAmDrawer = me === drawerId;

  mpDrawCanvas.classList.toggle("drawer-view", dgAmDrawer);
  mpDrawCanvas.classList.toggle("guesser-view", !dgAmDrawer);
  $("dgDrawToolbar").classList.toggle("hidden", !dgAmDrawer);

  const guessRow = $("dgGuessRow");
  const input = $("dgGuessInput");

  if (state.phase === "pick") {
    stopDgTimer();
    $("dgTimer").textContent = "";
    $("dgTimer").classList.remove("warn", "danger");
    if (dgAmDrawer) {
      $("dgStatus").textContent = "Choose a word in the popup to start drawing.";
    } else {
      $("dgStatus").textContent = "Friend is choosing what to draw…";
    }
    guessRow.classList.add("hidden");
    input.disabled = true;
    mpDrawCanvas.removeEventListener("pointerdown", onMpPointerDown);
    mpDrawCanvas.removeEventListener("pointermove", onMpPointerMove);
    mpDrawCanvas.removeEventListener("pointerup", onMpPointerUp);
    mpDrawCanvas.removeEventListener("pointercancel", onMpPointerUp);
  } else if (state.phase === "drawing") {
    $("dgStatus").textContent = dgAmDrawer ? `Draw it! Friend is guessing.` : `What is your friend drawing?`;
    dgEndsAt = state.endsAt || 0;
    startDgTimer();
    if (dgAmDrawer) {
      guessRow.classList.add("hidden");
      input.disabled = true;
      input.value = "";
      mpDrawCanvas.addEventListener("pointerdown", onMpPointerDown);
      mpDrawCanvas.addEventListener("pointermove", onMpPointerMove);
      mpDrawCanvas.addEventListener("pointerup", onMpPointerUp);
      mpDrawCanvas.addEventListener("pointercancel", onMpPointerUp);
    } else {
      guessRow.classList.remove("hidden");
      input.disabled = false;
      input.value = "";
      input.focus();
      mpDrawCanvas.removeEventListener("pointerdown", onMpPointerDown);
      mpDrawCanvas.removeEventListener("pointermove", onMpPointerMove);
      mpDrawCanvas.removeEventListener("pointerup", onMpPointerUp);
      mpDrawCanvas.removeEventListener("pointercancel", onMpPointerUp);
    }
  } else if (state.phase === "result") {
    stopDgTimer();
    $("dgTimer").textContent = "";
    $("dgTimer").classList.remove("warn", "danger");
    $("dgStatus").textContent = "Round over.";
    guessRow.classList.add("hidden");
    input.disabled = true;
    mpDrawCanvas.removeEventListener("pointerdown", onMpPointerDown);
    mpDrawCanvas.removeEventListener("pointermove", onMpPointerMove);
    mpDrawCanvas.removeEventListener("pointerup", onMpPointerUp);
    mpDrawCanvas.removeEventListener("pointercancel", onMpPointerUp);
  } else if (state.phase === "done") {
    stopDgTimer();
    $("dgTimer").textContent = "";
    guessRow.classList.add("hidden");
    input.disabled = true;
    const i0 = state.scores[0];
    const i1 = state.scores[1];
    let msg = "Match over. ";
    if (i0 === i1) msg += "Tie!";
    else if (i0 > i1) msg += `${name0} wins!`;
    else msg += `${name1} wins!`;
    $("dgStatus").textContent = msg;
    $("dgResult").textContent = "Tap ← or Back to lobby to play something else.";
    mpDrawCanvas.removeEventListener("pointerdown", onMpPointerDown);
    mpDrawCanvas.removeEventListener("pointermove", onMpPointerMove);
    mpDrawCanvas.removeEventListener("pointerup", onMpPointerUp);
    mpDrawCanvas.removeEventListener("pointercancel", onMpPointerUp);
  }
}

socket.on("drawCanvasClear", () => {
  clearMpDrawCanvas();
  mpRemoteStroke.lastPx = null;
  mpLastNorm = null;
});

socket.on("drawGuessState", (state) => {
  if (!screens.drawGuess.classList.contains("active")) return;
  updateDrawGuessUI(state);
});

socket.on("drawPickWords", ({ words }) => {
  if (words?.length) showDrawWordModal(words);
});

socket.on("drawStroke", (p) => {
  if (dgAmDrawer) return;
  applyRemoteStroke(p);
});

socket.on("drawGuessResult", ({ reason, word, scores }) => {
  const name0 = lobbyPlayers[0]?.name || "P1";
  const name1 = lobbyPlayers[1]?.name || "P2";
  $("dgScore").textContent = `${scores[0]} — ${scores[1]} · ${name0} vs ${name1} · First to 3`;
  const w = word ? `"${word}"` : "—";
  if (reason === "correct") {
    $("dgResult").textContent = `Correct! The word was ${w}. The guesser earns a point.`;
  } else {
    $("dgResult").textContent = `Time’s up! The word was ${w}. The drawer earns a point.`;
  }
  $("dgStatus").textContent = "Next round soon…";
});

socket.on("drawGuessWrong", ({ message }) => {
  $("dgWrong").textContent = message || "Try again.";
});

$("dgGuessBtn").addEventListener("click", () => {
  const v = $("dgGuessInput").value.trim();
  if (v) socket.emit("drawSubmitGuess", v);
});

$("dgGuessInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("dgGuessBtn").click();
});

$("btnBackLobbyDraw").addEventListener("click", () => {
  hideDrawWordModal();
  socket.emit("resetToLobby");
  showScreen("room");
});


/* Host game pick */
document.querySelectorAll("#hostGamePick [data-game]").forEach((btn) => {
  btn.addEventListener("click", () => {
    socket.emit("setGame", btn.dataset.game);
  });
});

showScreen("home");
