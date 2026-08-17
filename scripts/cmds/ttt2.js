const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const Canvas = require("canvas");
const GIFEncoder = require("gif-encoder-2");

// Canvas frame Dimensions
const W = 800, H = 900;
const FB_ACCESS_TOKEN = "350685531728|62f8ce9f74b12f84c123cc23437a4a32";

// Cyberpunk Color Palette
const PAL = {
  bg0: "#080c14",
  bg1: "#0f172a",
  gridBg: "#0d1b2a",
  cellBg: "#112233",
  borderGlow: "#00f0ff",
  textLight: "#e2e8f0",
  textMuted: "#64748b",
  playerX: "#ff0055",
  playerO: "#00f0ff",
  winLine: "#00ff88"
};

const FONT = {
  title: "bold 42px Orbitron, sans-serif",
  sub: "bold 22px Orbitron, sans-serif",
  cellNum: "bold 18px Orbitron, sans-serif",
  symbol: "bold 70px Orbitron, sans-serif"
};

// Rounded rectangle helper function
const rr = (ctx, x, y, w, h, r = 12) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Avatar fetch function with memory cache
const avatarCache = new Map();
async function getAvatar(uid, size = 200) {
  if (!uid) return null;
  if (avatarCache.has(uid)) return avatarCache.get(uid);
  try {
    const url = `https://graph.facebook.com/${uid}/picture?height=${size}&width=${size}&redirect=false&access_token=${FB_ACCESS_TOKEN}`;
    const { data } = await axios.get(url);
    const imgURL = data?.data?.url;
    if (!imgURL) return null;
    const imgBuf = (await axios.get(imgURL, { responseType: "arraybuffer" })).data;
    const img = await Canvas.loadImage(imgBuf);
    avatarCache.set(uid, img);
    return img;
  } catch {
    return null;
  }
}

// Color transition helpers
const lerp = (a, b, t) => a + (b - a) * t;
const lerpRGB = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
const COLORS = [[255, 0, 85], [0, 240, 255], [0, 255, 136], [255, 200, 0]];
const phaseColor = (p) => {
  const s = (p % 1) * COLORS.length;
  const i = Math.floor(s);
  const n = (i + 1) % COLORS.length;
  const t = s - i;
  return `rgb(${lerpRGB(COLORS[i], COLORS[n], t).join(",")})`;
};

// Game Logic Functions
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

function checkWinnerInfo(board) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], pattern };
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

function findWinningMove(board, player) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    const line = [board[a], board[b], board[c]];
    const countPlayer = line.filter(v => v === player).length;
    const countNull = line.filter(v => v === null).length;
    if (countPlayer === 2 && countNull === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  return null;
}

function makeBotMove(board, botSymbol) {
  const opponentSymbol = botSymbol === "⭕" ? "❌" : "⭕";

  // 1. Check if Bot can win
  const winMove = findWinningMove(board, botSymbol);
  if (winMove !== null) {
    board[winMove] = botSymbol;
    return;
  }

  // 2. Block opponent's winning move
  const blockMove = findWinningMove(board, opponentSymbol);
  if (blockMove !== null) {
    board[blockMove] = botSymbol;
    return;
  }

  // 3. Take center if open
  if (board[4] === null) {
    board[4] = botSymbol;
    return;
  }

  // 4. Take random open corner
  const corners = [0, 2, 6, 8].filter(i => board[i] === null);
  if (corners.length > 0) {
    const randomCorner = corners[Math.floor(Math.random() * corners.length)];
    board[randomCorner] = botSymbol;
    return;
  }

  // 5. Take any open cell
  const openCells = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
  if (openCells.length > 0) {
    const randomCell = openCells[Math.floor(Math.random() * openCells.length)];
    board[randomCell] = botSymbol;
  }
}

// Draw Canvas Frame for Animated GIF
async function drawBoardFrame(ctx, gameData, phase) {
  const { board, p1Name, p2Name, p1Img, p2Img, currentTurn, winnerInfo, statusText } = gameData;

  // Background Gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, PAL.bg0);
  bg.addColorStop(1, PAL.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer Glowing Border
  const borderGlowColor = phaseColor(phase);
  ctx.save();
  ctx.shadowColor = borderGlowColor;
  ctx.shadowBlur = 25;
  ctx.lineWidth = 6;
  ctx.strokeStyle = borderGlowColor;
  rr(ctx, 20, 20, W - 40, H - 40, 24);
  ctx.stroke();
  ctx.restore();

  // Header Title
  ctx.font = FONT.title;
  ctx.textAlign = "center";
  ctx.fillStyle = borderGlowColor;
  ctx.shadowColor = borderGlowColor;
  ctx.shadowBlur = 20;
  ctx.fillText("⚡ 3D TIC TAC TOE ⚡", W / 2, 75);
  ctx.shadowBlur = 0;

  // Players Info Section (Avatars & Names)
  const drawPlayerBadge = (x, y, name, img, symbol, isTurn, color) => {
    // Avatar Box
    const avSize = 80;
    ctx.save();

    // Turn Highlight Glow
    if (isTurn) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + avSize / 2, y + avSize / 2, avSize / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x + avSize / 2, y + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      ctx.drawImage(img, x, y, avSize, avSize);
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x, y, avSize, avSize);
      ctx.fillStyle = color;
      ctx.font = "bold 30px Orbitron";
      ctx.textAlign = "center";
      ctx.fillText(symbol, x + avSize / 2, y + avSize / 2 + 10);
    }
    ctx.restore();

    // Player Symbol Badge
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + avSize - 10, y + avSize - 10, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "bold 16px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText(symbol === "⭕" ? "O" : "X", x + avSize - 10, y + avSize - 5);

    // Name Text
    ctx.font = FONT.sub;
    ctx.fillStyle = isTurn ? color : PAL.textLight;
    ctx.textAlign = "left";
    ctx.fillText(name.length > 10 ? name.slice(0, 9) + ".." : name, x + avSize + 15, y + 45);
  };

  // Draw Player 1 (Left) & Player 2 / Bot (Right)
  drawPlayerBadge(50, 110, p1Name, p1Img, "⭕", currentTurn === "⭕", PAL.playerO);
  drawPlayerBadge(W / 2 + 40, 110, p2Name, p2Img, "❌", currentTurn === "❌", PAL.playerX);

  // Game Status Banner
  ctx.font = FONT.sub;
  ctx.textAlign = "center";
  ctx.fillStyle = borderGlowColor;
  ctx.fillText(statusText || (currentTurn === "⭕" ? `${p1Name} er Chal (⭕)` : `${p2Name} er Chal (❌)`), W / 2, 225);

  // 3x3 Board Grid Dimensions
  const boardSize = 510;
  const startX = (W - boardSize) / 2;
  const startY = 250;
  const cellSize = (boardSize - 20) / 3;

  // Board Container
  rr(ctx, startX - 10, startY - 10, boardSize + 20, boardSize + 20, 20);
  ctx.fillStyle = PAL.gridBg;
  ctx.fill();
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw 9 Grid Cells
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const cx = startX + col * (cellSize + 10);
    const cy = startY + row * (cellSize + 10);

    // Cell Background
    rr(ctx, cx, cy, cellSize, cellSize, 14);
    ctx.fillStyle = PAL.cellBg;
    ctx.fill();
    ctx.strokeStyle = "#1a2c42";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Corner Position Number (1 to 9) for Move Guidance
    if (board[i] === null) {
      ctx.font = FONT.cellNum;
      ctx.fillStyle = PAL.textMuted;
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}`, cx + 12, cy + 26);
    }

    // Cell Value (❌ or ⭕)
    if (board[i] === "❌") {
      ctx.save();
      ctx.font = FONT.symbol;
      ctx.textAlign = "center";
      ctx.fillStyle = PAL.playerX;
      ctx.shadowColor = PAL.playerX;
      ctx.shadowBlur = 25;
      ctx.fillText("✕", cx + cellSize / 2, cy + cellSize / 2 + 24);
      ctx.restore();
    } else if (board[i] === "⭕") {
      ctx.save();
      ctx.font = FONT.symbol;
      ctx.textAlign = "center";
      ctx.fillStyle = PAL.playerO;
      ctx.shadowColor = PAL.playerO;
      ctx.shadowBlur = 25;
      ctx.fillText("◯", cx + cellSize / 2, cy + cellSize / 2 + 24);
      ctx.restore();
    }
  }

  // Draw Winning Laser Line if someone won
  if (winnerInfo && winnerInfo.pattern) {
    const [a, , c] = winnerInfo.pattern;
    const rowA = Math.floor(a / 3), colA = a % 3;
    const rowC = Math.floor(c / 3), colC = c % 3;

    const x1 = startX + colA * (cellSize + 10) + cellSize / 2;
    const y1 = startY + rowA * (cellSize + 10) + cellSize / 2;
    const x2 = startX + colC * (cellSize + 10) + cellSize / 2;
    const y2 = startY + rowC * (cellSize + 10) + cellSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = PAL.winLine;
    ctx.shadowColor = PAL.winLine;
    ctx.shadowBlur = 30;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  // Light Sweep Shimmer Effect
  const sw = ctx.createLinearGradient(0, 0, W, H);
  const sh = (phase + (Date.now() % 3000) / 3000) % 1;
  sw.addColorStop(Math.max(0, sh - 0.2), "rgba(255,255,255,0)");
  sw.addColorStop(sh, "rgba(255,255,255,0.08)");
  sw.addColorStop(Math.min(1, sh + 0.2), "rgba(255,255,255,0)");
  ctx.fillStyle = sw;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
}

// Generate Animated GIF File
async function makeGameGif(gameData, threadID) {
  const outDir = path.join(__dirname, "cache");
  await fs.ensureDir(outDir);
  const outPath = path.join(outDir, `ttt_${threadID}_${Date.now()}.gif`);

  const enc = new GIFEncoder(W, H);
  enc.start();
  enc.setRepeat(0);
  enc.setDelay(150);
  enc.setQuality(15);

  const canvas = Canvas.createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Fetch Avatars
  gameData.p1Img = await getAvatar(gameData.p1ID);
  gameData.p2Img = await getAvatar(gameData.p2ID);

  // Render 8 Frames for animation
  for (let i = 0; i < 8; i++) {
    await drawBoardFrame(ctx, gameData, i / 8);
    enc.addFrame(ctx);
  }

  enc.finish();
  fs.writeFileSync(outPath, enc.out.getData());
  return outPath;
}

// Global active games store
let activeGames = {};

module.exports = {
  config: {
    name: "ttt2",
    aliases: ["tictactoe2", "tttgif2"],
    version: "3.0.0",
    author: "Vex_Kshitiz & ST modified by opu",
    cooldown: 3,
    role: 0,
    category: "game",
    shortDescription: "3D Cyberpunk Animated Tic-Tac-Toe Game",
    longDescription: "Play 3D Animated Tic-Tac-Toe vs Bot or Friends in Messenger",
    guide: "{p}ttt (Single player) or {p}ttt @mention (Two player)"
  },

  onStart: async function ({ event, api }) {
    const threadID = event.threadID;
    const player1ID = event.senderID;
    const mentions = Object.keys(event.mentions || {});

    try {
      const p1Info = await api.getUserInfo(player1ID);
      const p1Name = p1Info[player1ID]?.name || "Player 1";

      let p2ID = null;
      let p2Name = "Cyber Bot";

      if (mentions.length > 0) {
        p2ID = mentions[0];
        const p2Info = await api.getUserInfo(p2ID);
        p2Name = p2Info[p2ID]?.name || "Player 2";
      }

      // Initialize game state
      activeGames[threadID] = {
        board: Array(9).fill(null),
        p1ID: player1ID,
        p1Name: p1Name,
        p2ID: p2ID,
        p2Name: p2Name,
        isVsBot: mentions.length === 0,
        currentTurn: Math.random() < 0.5 ? "⭕" : "❌",
        inProgress: true,
        lastMessageID: null,
        winnerInfo: null,
        statusText: ""
      };

      const game = activeGames[threadID];
      game.statusText = game.isVsBot
        ? (game.currentTurn === "⭕" ? `${p1Name} er Chal (⭕)` : "Bot er Chal (❌)")
        : (game.currentTurn === "⭕" ? `${p1Name} er Chal (⭕)` : `${p2Name} er Chal (❌)`);

      // If Bot goes first in single-player mode
      if (game.isVsBot && game.currentTurn === "❌") {
        makeBotMove(game.board, "❌");
        game.currentTurn = "⭕";
        game.statusText = `${p1Name} er Chal (⭕)`;
      }

      const gifPath = await makeGameGif(game, threadID);
      const sentMsg = await api.sendMessage({
        body: `🎮 3D Tic-Tac-Toe Match Shuru Hoyeche!\n👉 Chal dite 1-9 kono number reply/send korun.`,
        attachment: fs.createReadStream(gifPath)
      }, threadID, event.messageID);

      game.lastMessageID = sentMsg.messageID;
      fs.unlink(gifPath, () => {});
    } catch (err) {
      console.error(err);
      api.sendMessage("❌ Game GIF board তৈরি করতে সমস্যা হয়েছে।", threadID, event.messageID);
    }
  },

  onChat: async function ({ event, api, args }) {
    const threadID = event.threadID;
    const senderID = event.senderID;
    const game = activeGames[threadID];

    if (!game || !game.inProgress) return;

    const movePos = parseInt(args[0]);
    if (isNaN(movePos) || movePos < 1 || movePos > 9) return;

    const cellIdx = movePos - 1;

    // Check if player turn matches
    if (game.isVsBot) {
      if (senderID !== game.p1ID) return;
      if (game.board[cellIdx] !== null) return;

      // Player Move (⭕)
      game.board[cellIdx] = "⭕";

      // Check Winner or Draw after Player Move
      let winCheck = checkWinnerInfo(game.board);
      if (winCheck) {
        game.winnerInfo = winCheck;
        game.inProgress = false;
        game.statusText = `🎉 ${game.p1Name} Bijoyee Hoyeche!`;
      } else if (isBoardFull(game.board)) {
        game.inProgress = false;
        game.statusText = "🤝 Khela Match Draw Hoyeche!";
      } else {
        // Bot Move (❌)
        makeBotMove(game.board, "❌");
        winCheck = checkWinnerInfo(game.board);
        if (winCheck) {
          game.winnerInfo = winCheck;
          game.inProgress = false;
          game.statusText = `🤖 Bot Bijoyee Hoyeche!`;
        } else if (isBoardFull(game.board)) {
          game.inProgress = false;
          game.statusText = "🤝 Khela Match Draw Hoyeche!";
        } else {
          game.statusText = `${game.p1Name} er Chal (⭕)`;
        }
      }
    } else {
      // 2-Player Mode
      const isP1 = senderID === game.p1ID;
      const isP2 = senderID === game.p2ID;

      if (!isP1 && !isP2) return;
      if (isP1 && game.currentTurn !== "⭕") return;
      if (isP2 && game.currentTurn !== "❌") return;
      if (game.board[cellIdx] !== null) return;

      const symbol = isP1 ? "⭕" : "❌";
      game.board[cellIdx] = symbol;

      const winCheck = checkWinnerInfo(game.board);
      if (winCheck) {
        game.winnerInfo = winCheck;
        game.inProgress = false;
        game.statusText = `🎉 ${isP1 ? game.p1Name : game.p2Name} Bijoyee Hoyeche!`;
      } else if (isBoardFull(game.board)) {
        game.inProgress = false;
        game.statusText = "🤝 Khela Match Draw Hoyeche!";
      } else {
        game.currentTurn = isP1 ? "❌" : "⭕";
        game.statusText = game.currentTurn === "⭕" ? `${game.p1Name} er Chal (⭕)` : `${game.currentTurn === "❌" ? game.p2Name : "Bot"} er Chal (❌)`;
      }
    }

    // Render & Send Updated GIF Board
    try {
      const gifPath = await makeGameGif(game, threadID);

      // Delete previous GIF message to keep chat clean
      if (game.lastMessageID) {
        try { api.unsendMessage(game.lastMessageID); } catch {}
      }

      const sentMsg = await api.sendMessage({
        body: game.statusText,
        attachment: fs.createReadStream(gifPath)
      }, threadID);

      game.lastMessageID = sentMsg.messageID;
      fs.unlink(gifPath, () => {});

      // Clear completed game memory
      if (!game.inProgress) {
        delete activeGames[threadID];
      }
    } catch (e) {
      console.error(e);
    }
  }
};
