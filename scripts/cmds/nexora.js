const axios = require("axios");
const fs = require("fs");
const path = require("path");

// yt-search is only needed for the "sing/song" feature — wrapped so a
// missing package doesn't crash the whole bot. Run: npm install yt-search
let yts = null;
try { yts = require("yt-search"); } catch (e) { console.error("⚠️ Nexora: 'yt-search' package not installed — song feature disabled until you run: npm install yt-search"); }

/* ===============================
   🔧 CONFIG
   👉 Put all your keys/IDs directly here.
================================*/
const CONFIG = {
  NAME: "Nexora AI",
  TRIGGER: "nexora",
  MAX_MEMORY: 20,

  // per-user cooldown (ms)
  COOLDOWN: 1500,

  // per-group (thread) rate limit — max N messages within WINDOW ms
  GROUP_WINDOW: 10000,
  GROUP_MAX: 8,

  // 👉 paste your OpenRouter API key here
  API_KEY: "PUT_YOUR_OPENROUTER_KEY_HERE",
  MODEL: "openrouter/free",
  FALLBACK_MODEL: "mistralai/mistral-7b",
  // vision-capable model for image-to-text — swap if your OpenRouter plan differs
  VISION_MODEL: "meta-llama/llama-3.2-11b-vision-instruct:free",

  // AccuWeather key
  WEATHER_API_KEY: "d7e795ae6a0d44aaa8abb1a0a7ac19e4",

  // 👉 admin user IDs go here, comma-separated inside the quotes, e.g. "1000123,1000456"
  ADMINS: "".split(",").map(s => s.trim()).filter(Boolean),

  // 👉 fallback bot user ID, only needed if your framework doesn't expose api.getCurrentUserID()
  BOT_ID: null,

  DATA_FILE: path.join(__dirname, "nexora_data.json"),

  // long-term "remember" facts per user
  MAX_FACTS: 25,

  // shortest input we accept for prompts/queries
  MIN_PROMPT_LEN: 3,

  // mini-games: reward points + per-user cooldown
  GAME: {
    COOLDOWN: 8000,
    ANSWER_WINDOW: 60000,
    REWARDS: { quiz: 10, math: 5, riddle: 15 },
    DAILY_CAP: 100
  },

  MODES: {
    default: "Helpful, precise, warm — like a top-tier AI assistant. Give clear, well-organized answers. Use emojis rarely, only when it genuinely fits the tone.",
    funny: "Witty, sarcastic, cracks jokes constantly, never fully serious.",
    serious: "Formal, precise, no emojis, straight to the point.",
    savage: "Blunt, roasts the user playfully, zero filter but not offensive."
  }
};

/* ===============================
   💾 PERSISTENT STORE
================================*/
const Store = {
  data: null,

  load() {
    if (this.data) return; // Load only once into memory
    try {
      if (fs.existsSync(CONFIG.DATA_FILE)) {
        this.data = JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, "utf8"));
      }
    } catch (e) {
      console.error("⚠️ Nexora: failed to read data file, starting fresh:", e.message);
    }
    if (!this.data) {
      this.data = {
        memory: {},               // { userId: [{role,content}, ...] }
        users: {},                // { userId: { mode: "default", voice: false } }
        stats: { total: 0, users: {} },
        banned: [],
        facts: {},                // { userId: [{text, ts}, ...] }
        game: { scores: {}, pending: {}, daily: {} }
      };
    }
    // backfill missing fields
    this.data.memory = this.data.memory || {};
    this.data.users = this.data.users || {};
    this.data.stats = this.data.stats || { total: 0, users: {} };
    this.data.banned = this.data.banned || [];
    this.data.facts = this.data.facts || {};
    this.data.game = this.data.game || { scores: {}, pending: {}, daily: {} };
    this.data.game.scores = this.data.game.scores || {};
    this.data.game.pending = this.data.game.pending || {};
    this.data.game.daily = this.data.game.daily || {};
  },

  save() {
    try {
      const tmpFile = `${CONFIG.DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmpFile, CONFIG.DATA_FILE);
    } catch (e) {
      console.error("⚠️ Nexora: failed to save data file:", e.message);
    }
  },

  user(id) {
    if (!this.data.users[id]) this.data.users[id] = { mode: "default", voice: false, style: "clean" };
    if (this.data.users[id].style === undefined) this.data.users[id].style = "clean";
    return this.data.users[id];
  }
};

// Initialize Store
Store.load();

/* ===============================
   🧠 MEMORY (rolling chat context)
================================*/
const MAX_MEMORY_CHARS = 2000;

const Memory = {
  get(id) {
    if (!Store.data.memory[id]) Store.data.memory[id] = [];
    return Store.data.memory[id];
  },
  add(id, role, content) {
    const m = this.get(id);
    const safeContent = typeof content === "string" && content.length > MAX_MEMORY_CHARS
      ? content.slice(0, MAX_MEMORY_CHARS) + "…"
      : content;
    m.push({ role, content: safeContent });
    if (m.length > CONFIG.MAX_MEMORY) m.shift();
    Store.save();
  },
  clear(id) {
    Store.data.memory[id] = [];
    Store.save();
  },
  clearAll() {
    Store.data.memory = {};
    Store.save();
  }
};

/* ===============================
   🧠 LONG-TERM FACTS ("nexora remember ...")
================================*/
const MAX_FACT_CHARS = 300;

const Facts = {
  get(id) {
    if (!Store.data.facts[id]) Store.data.facts[id] = [];
    return Store.data.facts[id];
  },
  add(id, text) {
    const list = this.get(id);
    const safeText = text.length > MAX_FACT_CHARS ? text.slice(0, MAX_FACT_CHARS) + "…" : text;
    list.push({ text: safeText, ts: Date.now() });
    if (list.length > CONFIG.MAX_FACTS) list.shift();
    Store.save();
  },
  clear(id) {
    Store.data.facts[id] = [];
    Store.save();
  }
};

/* ===============================
   📊 STATS
================================*/
const Stats = {
  add(id) {
    Store.data.stats.total++;
    Store.data.stats.users[id] = (Store.data.stats.users[id] || 0) + 1;
    Store.save();
  }
};

/* ===============================
   🚫 BAN LIST
================================*/
const Ban = {
  isBanned(id) {
    return Store.data.banned.includes(id);
  },
  ban(id) {
    if (!Store.data.banned.includes(id)) Store.data.banned.push(id);
    Store.save();
  },
  unban(id) {
    Store.data.banned = Store.data.banned.filter(x => x !== id);
    Store.save();
  }
};

function isAdmin(id) {
  return CONFIG.ADMINS.includes(String(id));
}

/* ===============================
   🚦 COOLDOWN
================================*/
const userCooldown = {};
const groupWindow = {};

const Cooldown = {
  checkUser(id) {
    const now = Date.now();
    if (userCooldown[id] && now - userCooldown[id] < CONFIG.COOLDOWN) return true;
    userCooldown[id] = now;
    return false;
  },
  checkGroup(threadID) {
    if (!threadID) return false;
    const now = Date.now();
    const arr = (groupWindow[threadID] || []).filter(t => now - t < CONFIG.GROUP_WINDOW);
    arr.push(now);
    groupWindow[threadID] = arr;
    return arr.length > CONFIG.GROUP_MAX;
  }
};

/* ===============================
   🎮 MINI GAMES
================================*/
const QUIZ_QUESTIONS = [
  { q: "What is the capital of Japan?", options: ["Seoul", "Tokyo", "Beijing", "Bangkok"], answer: "2" },
  { q: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], answer: "3" },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: "2" },
  { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: "4" },
  { q: "Who wrote 'Romeo and Juliet'?", options: ["Dickens", "Shakespeare", "Tolstoy", "Homer"], answer: "2" },
  { q: "What gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: "3" },
  { q: "How many minutes are in a full day?", options: ["1440", "1240", "1000", "1600"], answer: "1" },
  { q: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], answer: "3" },
  { q: "Which country invented pizza?", options: ["France", "Italy", "Greece", "Spain"], answer: "2" },
  { q: "What is the smallest prime number?", options: ["0", "1", "2", "3"], answer: "3" }
];

const RIDDLES = [
  { q: "I speak without a mouth and hear without ears. What am I?", a: "echo" },
  { q: "The more you take, the more you leave behind. What am I?", a: "footsteps" },
  { q: "What has hands but can't clap?", a: "clock" },
  { q: "What has a neck but no head?", a: "bottle" },
  { q: "I'm tall when I'm young and short when I'm old. What am I?", a: "candle" },
  { q: "What has to be broken before you can use it?", a: "egg" },
  { q: "What month of the year has 28 days?", a: "all of them" },
  { q: "What gets wetter as it dries?", a: "towel" }
];

const gameCooldown = {};

const Game = {
  score(id) {
    return Store.data.game.scores[id] || 0;
  },
  addScore(id, pts) {
    Store.data.game.scores[id] = this.score(id) + pts;
    Store.save();
  },
  todayKey() {
    return new Date().toISOString().slice(0, 10);
  },
  dailyEarned(id) {
    const rec = Store.data.game.daily[id];
    if (!rec || rec.date !== this.todayKey()) return 0;
    return rec.points;
  },
  addDailyEarned(id, pts) {
    const key = this.todayKey();
    const rec = Store.data.game.daily[id];
    if (!rec || rec.date !== key) {
      Store.data.game.daily[id] = { date: key, points: pts };
    } else {
      rec.points += pts;
    }
    Store.save();
  },
  award(id, pts) {
    const remaining = Math.max(0, CONFIG.GAME.DAILY_CAP - this.dailyEarned(id));
    const awarded = Math.min(pts, remaining);
    if (awarded > 0) {
      this.addScore(id, awarded);
      this.addDailyEarned(id, awarded);
    }
    return awarded;
  },
  setPending(id, data) {
    Store.data.game.pending[id] = data;
    Store.save();
  },
  getPending(id) {
    return Store.data.game.pending[id] || null;
  },
  clearPending(id) {
    delete Store.data.game.pending[id];
    Store.save();
  },
  onCooldown(id) {
    const now = Date.now();
    if (gameCooldown[id] && now - gameCooldown[id] < CONFIG.GAME.COOLDOWN) return true;
    gameCooldown[id] = now;
    return false;
  }
};

function startQuiz(message, id) {
  if (Game.onCooldown(id)) return message.reply("⏳ Slow down a bit before starting another game.");
  const q = QUIZ_QUESTIONS[Math.floor(Math.random() * QUIZ_QUESTIONS.length)];
  Game.setPending(id, { type: "quiz", answer: q.answer, points: CONFIG.GAME.REWARDS.quiz, expiresAt: Date.now() + CONFIG.GAME.ANSWER_WINDOW });
  const opts = q.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
  return message.reply(`🧠 QUIZ TIME!\n${q.q}\n${opts}\n\n👉 Reply: nexora answer <number>`);
}

function startMath(message, id) {
  if (Game.onCooldown(id)) return message.reply("⏳ Slow down a bit before starting another game.");
  const a = Math.floor(Math.random() * 50) + 1;
  const b = Math.floor(Math.random() * 50) + 1;
  const ops = ["+", "-", "*"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  Game.setPending(id, { type: "math", answer: String(answer), points: CONFIG.GAME.REWARDS.math, expiresAt: Date.now() + CONFIG.GAME.ANSWER_WINDOW });
  return message.reply(`🔢 MATH CHALLENGE!\nWhat is ${a} ${op} ${b}?\n\n👉 Reply: nexora answer <number>`);
}

function startRiddle(message, id) {
  if (Game.onCooldown(id)) return message.reply("⏳ Slow down a bit before starting another game.");
  const r = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
  Game.setPending(id, { type: "riddle", answer: r.a.toLowerCase(), points: CONFIG.GAME.REWARDS.riddle, expiresAt: Date.now() + CONFIG.GAME.ANSWER_WINDOW });
  return message.reply(`❓ RIDDLE ME THIS!\n${r.q}\n\n👉 Reply: nexora answer <your answer>`);
}

function checkGameAnswer(message, id, rawAnswer) {
  const pending = Game.getPending(id);
  if (!pending) return message.reply("⚠️ You don't have an active game. Try: nexora game quiz");

  if (Date.now() > pending.expiresAt) {
    Game.clearPending(id);
    return message.reply("⏰ Time's up for that one! Start a new round: nexora game quiz/math/riddle");
  }

  const given = rawAnswer.trim().toLowerCase();
  let correct;
  if (pending.type === "riddle") {
    correct = given.includes(pending.answer) || pending.answer.includes(given);
  } else {
    correct = given.replace(/\s+/g, "") === String(pending.answer).toLowerCase();
  }

  Game.clearPending(id);

  if (correct) {
    const awarded = Game.award(id, pending.points);
    if (awarded < pending.points) {
      return message.reply(
        awarded > 0
          ? `✅ Correct! +${awarded} points (daily reward limit reached, capped) 🎉\n🏆 Total score: ${Game.score(id)}`
          : `✅ Correct! 🎉 You've hit today's reward limit (${CONFIG.GAME.DAILY_CAP} pts/day) so no extra points this time.\n🏆 Total score: ${Game.score(id)}`
      );
    }
    return message.reply(`✅ Correct! +${awarded} points 🎉\n🏆 Total score: ${Game.score(id)}`);
  }
  return message.reply(`❌ Not quite! The correct answer was: ${pending.answer}\n🏆 Your score: ${Game.score(id)}`);
}

/* ===============================
   🖼️ IMAGE DETECTION
================================*/
function isImageRequest(text) {
  const t = text.toLowerCase();
  if (/\b(image|img|pic|picture|photo|drawing|wallpaper)\b/.test(t)) return true;
  if (/\b(draw|generate)\b(\s+me)?\s+(a|an|some)\s+\w+/.test(t)) return true;
  return false;
}

function extractImagePrompt(rawText) {
  let style = null;
  const styleMatch = rawText.match(/--style\s+([a-zA-Z0-9_-]+)/i);
  if (styleMatch) {
    style = styleMatch[1];
    rawText = rawText.replace(styleMatch[0], "");
  }

  const cleaned = rawText
    .replace(/nexora/gi, "")
    .replace(/\b(generate|draw|create|make)\b/gi, "")
    .replace(/\b(image|img|pic|picture|photo|drawing|art|wallpaper)\b/gi, "")
    .replace(/\bme\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const fallback = rawText.replace(/nexora/gi, "").replace(/\s+/g, " ").trim();
  const prompt = cleaned.length >= CONFIG.MIN_PROMPT_LEN ? cleaned : fallback;

  return { prompt, style };
}

/* ===============================
   🎨 IMAGE GENERATION
================================*/
function validateImageBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf)) return false;
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isJpeg && !isPng) return false;
  if (buf.length < 1000) return false;
  return true;
}

const IMAGE_PROVIDERS = [
  {
    name: "pollinations-flux",
    async fetch(prompt) {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&nologo=true&width=768&height=768&seed=${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const res = await axios({ url, method: "GET", responseType: "arraybuffer", timeout: 45000, headers: { "User-Agent": "Mozilla/5.0" } });
      return Buffer.from(res.data);
    }
  },
  {
    name: "pollinations-turbo",
    async fetch(prompt) {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=turbo&nologo=true&width=768&height=768&seed=${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const res = await axios({ url, method: "GET", responseType: "arraybuffer", timeout: 45000, headers: { "User-Agent": "Mozilla/5.0" } });
      return Buffer.from(res.data);
    }
  },
  {
    name: "hinata-text2img",
    async fetch(prompt) {
      const base = await getHinataBase();
      const res = await axios.get(`${base}/api/text2img?prompt=${encodeURIComponent(prompt)}`, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      return Buffer.from(res.data);
    }
  }
];

async function generateImageBuffer(finalPrompt) {
  let lastErr = new Error("All image providers failed");

  for (let attempt = 0; attempt < 3; attempt++) {
    const provider = IMAGE_PROVIDERS[attempt % IMAGE_PROVIDERS.length];
    try {
      const buf = await provider.fetch(finalPrompt);
      if (!validateImageBuffer(buf)) throw new Error(`Invalid/empty image buffer from ${provider.name}`);
      return buf;
    } catch (e) {
      lastErr = e;
      console.error(`⚠️ Nexora image provider "${provider.name}" attempt ${attempt + 1}/3 failed:`, e.message);
    }
  }

  throw lastErr;
}

async function sendImage(message, prompt, style) {
  if (!prompt || prompt.trim().length < CONFIG.MIN_PROMPT_LEN) {
    return message.reply("⚠️ Prompt ta khub choto/khali — kichu bishoy likh, jemon: nexora generate a cat");
  }

  const filePath = path.join(__dirname, `cache_${Date.now()}_${Math.floor(Math.random() * 9999)}.jpg`);
  const finalPrompt = style ? `${prompt}, ${style} style` : prompt;

  try {
    await message.reply("🎨 Nexora is thinking...");

    const buf = await generateImageBuffer(finalPrompt);
    fs.writeFileSync(filePath, buf);

    await message.reply({
      body: `🖼️ ${finalPrompt}`,
      attachment: fs.createReadStream(filePath)
    });

    fs.unlinkSync(filePath);

  } catch (e) {
    console.error("❌ Nexora image error:", e.message);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (cleanupErr) { console.error("⚠️ Nexora image cleanup failed:", cleanupErr.message); }
    }
    return message.reply("❌ Couldn't generate that image right now — all image providers are unavailable. Try again shortly.");
  }
}

/* ===============================
   🔁 RETRY HELPER
================================*/
async function withRetry(fn, retries = 1, delayMs = 500) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/* ===============================
   🌐 WEB SEARCH
================================*/
const SEARCH_SUMMARY_MAX_CHARS = 800;

async function searchWeb(query) {
  const res = await axios.get("https://api.duckduckgo.com/", {
    params: { q: query, format: "json", no_html: 1, skip_disambig: 1 },
    timeout: 15000
  });

  const data = res.data || {};
  let text = data.AbstractText || data.Answer || "";
  let source = data.AbstractURL || null;

  if (!text && Array.isArray(data.RelatedTopics)) {
    const first = data.RelatedTopics.find(t => t && t.Text);
    if (first) {
      text = first.Text;
      source = first.FirstURL || source;
    }
  }

  if (!text) {
    const err = new Error("NO_RESULT");
    err.code = "NO_RESULT";
    throw err;
  }

  text = text.replace(/\s+/g, " ").trim();
  if (text.length > SEARCH_SUMMARY_MAX_CHARS) {
    text = text.slice(0, SEARCH_SUMMARY_MAX_CHARS).trim() + "…";
  }

  return { text, source };
}

async function handleSearch(message, query, id) {
  if (!query || query.trim().length < CONFIG.MIN_PROMPT_LEN) {
    return message.reply("🔎 Usage: nexora search <your question>");
  }

  try {
    await message.reply("🔎 Nexora is thinking...");

    let resultText;
    let fromWeb = true;
    try {
      const { text, source } = await withRetry(() => searchWeb(query), 2, 800);
      resultText = source ? `${text}\n\n🔗 Source: ${source}` : text;
    } catch (searchErr) {
      fromWeb = false;
      console.error("⚠️ Nexora web search failed, falling back to AI:", searchErr.message);
      try {
        resultText = await AI.ask([
          AI.system(Store.user(id).mode),
          { role: "user", content: `Answer this like a quick, factual web-search summary: ${query}` }
        ]);
      } catch (aiErr) {
        console.error("❌ Nexora search AI fallback failed:", aiErr.message);
        return message.reply("❌ Couldn't search that right now. Try again shortly.");
      }
    }

    Stats.add(id);
    const label = fromWeb ? "" : "🤖 (AI-generated summary)\n";
    return message.reply(format(label + resultText, id, Store.user(id).style));
  } catch (e) {
    console.error("❌ Nexora search error:", e.message);
    return message.reply("❌ Couldn't search that right now, try again in a moment.");
  }
}

/* ===============================
   💻 CODE GENERATOR
================================*/
function ensureCodeFenced(reply, prompt) {
  if (/```/.test(reply)) return reply;

  const p = prompt.toLowerCase();
  let lang = "";
  if (/\bhtml\b/.test(p)) lang = "html";
  else if (/\bpython\b|\.py\b/.test(p)) lang = "python";
  else if (/\bdiscord\b|\bnode\b|javascript|\bjs\b/.test(p)) lang = "javascript";
  else if (/\bcss\b/.test(p)) lang = "css";
  else if (/\bjava\b/.test(p)) lang = "java";
  else if (/\bc\+\+\b|cpp/.test(p)) lang = "cpp";

  return `${reply}\n\n\`\`\`${lang}\n// (re-formatted)\n\`\`\``;
}

async function handleCodeGen(message, prompt, id) {
  if (!prompt || prompt.trim().length < CONFIG.MIN_PROMPT_LEN) {
    return message.reply("💻 Usage: nexora code <what to build>, e.g. nexora code html login page");
  }

  try {
    await message.reply("💻 Nexora is thinking...");

    const messages = [
      {
        role: "system",
        content: `You are an expert software engineer. The user wants code for: "${prompt}".
Automatically detect the language/framework.
Respond with: 1) a short 1-2 sentence explanation, 2) complete code inside a markdown block.`
      },
      { role: "user", content: prompt }
    ];

    const reply = await withRetry(() => AI.ask(messages), 2, 800);
    const finalReply = ensureCodeFenced(reply, prompt);
    Stats.add(id);
    return message.reply(format(finalReply, id, Store.user(id).style));
  } catch (e) {
    console.error("❌ Nexora code-gen error:", e.message);
    return message.reply("❌ Couldn't generate code right now, try again in a moment.");
  }
}

/* ===============================
   🌐 BASE URL LOADERS
================================*/
let hinataBaseCache = null;
async function getHinataBase(forceRefresh) {
  if (hinataBaseCache && !forceRefresh) return hinataBaseCache;
  const res = await axios.get(
    "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
    { timeout: 10000 }
  );
  hinataBaseCache = res.data.mahmud;
  return hinataBaseCache;
}

let sayBaseCache = null;
async function getSayBase(forceRefresh) {
  if (sayBaseCache && !forceRefresh) return sayBaseCache;
  try {
    const res = await axios.get(
      "https://raw.githubusercontent.com/mahmudx7/exe/main/baseApiUrl.json",
      { timeout: 8000 }
    );
    sayBaseCache = res.data.mahmud;
  } catch (e) {
    sayBaseCache = "https://api.mahmudx7.xyz";
  }
  return sayBaseCache;
}

/* ===============================
   🔊 TEXT-TO-SPEECH
================================*/
async function sendVoice(message, text) {
  const filePath = path.join(__dirname, `voice_${Date.now()}.mp3`);
  try {
    const base = await getSayBase();
    const res = await axios({
      url: base + "/api/say",
      method: "GET",
      params: { text },
      headers: { Author: "MahMUD" },
      responseType: "arraybuffer",
      timeout: 30000
    });

    fs.writeFileSync(filePath, res.data);
    await message.reply({ attachment: fs.createReadStream(filePath) });
    fs.unlinkSync(filePath);
  } catch (e) {
    console.error("⚠️ TTS failed, falling back to text:", e.message);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (cleanupErr) {} }
    return message.reply(text);
  }
}

/* ===============================
   🔍 IMAGE HELPERS
================================*/
function isUpscaleRequest(text) {
  return /\b(upscale|4k|hd|enhance)\b/i.test(text);
}

function isEditImageRequest(text) {
  return /\bedit\b/i.test(text);
}

function extractEditPrompt(rawText) {
  return rawText
    .replace(/nexora/gi, "")
    .replace(/\bedit\b/gi, "")
    .replace(/\bthis\s+image\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTargetImageUrl(event) {
  if (event.messageReply && event.messageReply.attachments &&
      event.messageReply.attachments[0] && event.messageReply.attachments[0].type === "photo") {
    return event.messageReply.attachments[0].url;
  }
  if (event.attachments && event.attachments[0] && event.attachments[0].type === "photo") {
    return event.attachments[0].url;
  }
  return null;
}

/* ===============================
   🖼️ UPSCALE & EDIT
================================*/
async function upscaleImage(message, imgUrl) {
  const filePath = path.join(__dirname, `upscale_${Date.now()}.jpg`);
  try {
    await message.reply("✨ Nexora is thinking...");

    let base = await getHinataBase();
    let res;
    try {
      res = await axios.get(`${base}/api/hd/mahmud?imgUrl=${encodeURIComponent(imgUrl)}`, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
    } catch (firstErr) {
      base = await getHinataBase(true);
      res = await axios.get(`${base}/api/hd/mahmud?imgUrl=${encodeURIComponent(imgUrl)}`, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
    }

    if (!validateImageBuffer(Buffer.from(res.data))) throw new Error("Invalid image buffer");

    fs.writeFileSync(filePath, res.data);
    await message.reply({ body: "✅ Image upscaled!", attachment: fs.createReadStream(filePath) });
    fs.unlinkSync(filePath);
  } catch (e) {
    console.error("❌ Nexora upscale error:", e.message);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (cleanupErr) {} }
    return message.reply("❌ Couldn't upscale that image, try again.");
  }
}

async function editImage(message, imgUrl, prompt) {
  const filePath = path.join(__dirname, `edit_${Date.now()}.jpg`);
  try {
    await message.reply("🎨 Nexora is thinking...");

    const base = await getHinataBase();
    const res = await withRetry(() => axios.post(
      `${base}/api/edit`,
      { prompt, imageUrl: imgUrl },
      { responseType: "arraybuffer", timeout: 45000 }
    ), 1, 500);

    const buf = Buffer.from(res.data);
    if (!validateImageBuffer(buf)) throw new Error("Invalid image buffer");

    fs.writeFileSync(filePath, buf);
    await message.reply({ body: `✅ Done!\nPrompt: ${prompt}`, attachment: fs.createReadStream(filePath) });
    fs.unlinkSync(filePath);
  } catch (e) {
    console.error("❌ Nexora edit error:", e.message);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (cleanupErr) {} }
    return message.reply("❌ Couldn't edit that image, try again.");
  }
}

/* ===============================
   🎵 SONG SEARCH & DOWNLOAD
================================*/
function isSongRequest(text) {
  const t = text.toLowerCase();
  if (/\bsing\b/.test(t)) return true;
  if (/\b(gan|gaan|song)\b/.test(t) && /\b(ane|ano|dao|daw|dio|dibi)\b/.test(t)) return true;
  return false;
}

function extractSongQuery(rawText) {
  return rawText
    .replace(/nexora/gi, "")
    .replace(/\bsing\b/gi, "")
    .replace(/\b(gan|gaan|song)\b/gi, "")
    .replace(/\b(ane|ano|dao|daw|dio|dibi|amake|amar)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendSong(message, query) {
  if (!yts) {
    return message.reply("❌ Song feature needs 'yt-search'. Run: npm install yt-search");
  }
  if (!query || query.trim().length < CONFIG.MIN_PROMPT_LEN) return message.reply("🎵 কোন গান? গানের নাম বল।");

  const filePath = path.join(__dirname, `song_${Date.now()}.mp3`);

  try {
    await message.reply("🎵 Nexora is thinking...");

    const search = await withRetry(() => yts(query), 1, 500);
    if (!search || !search.videos || !search.videos.length) return message.reply("❌ No results found for that song.");
    const v = search.videos[0];

    if (!global.utils || typeof global.utils.STBotApis !== "function") {
      return message.reply("❌ Song downloader isn't set up on this bot (missing STBotApis util).");
    }
    const stapi = new global.utils.STBotApis();

    const dl = await withRetry(
      () => axios.post(`${stapi.baseURL}/audioytdlv1`, { url: v.url, format: "mp3" }, { timeout: 30000 }),
      1, 500
    );
    if (!dl.data || !dl.data.downloadUrl) return message.reply("❌ Download failed for that song.");

    const audio = await withRetry(
      () => axios.get(dl.data.downloadUrl, { responseType: "arraybuffer", timeout: 60000 }),
      1, 500
    );
    fs.writeFileSync(filePath, Buffer.from(audio.data));

    await message.reply({
      body: `🎶 ${v.title}\n👤 ${v.author.name}\n⏱ ${v.timestamp}`,
      attachment: fs.createReadStream(filePath)
    });
    fs.unlinkSync(filePath);
  } catch (e) {
    console.error("❌ Nexora song error:", e.message);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (cleanupErr) {}
    }
    return message.reply("❌ Couldn't fetch that song, try again.");
  }
}

/* ===============================
   🌦️ WEATHER
================================*/
function convertFtoC(F) {
  return Math.floor((F - 32) / 1.8);
}

function isWeatherRequest(text) {
  return /\bweather\b/i.test(text) || /আবহাওয়া/.test(text) || /\babhawa\b/i.test(text);
}

function extractWeatherLocation(rawText) {
  return rawText
    .replace(/nexora/gi, "")
    .replace(/\bweather\b/gi, "")
    .replace(/আবহাওয়া/g, "")
    .replace(/\babhawa\b/gi, "")
    .replace(/\b(today|now|current|in|kemon|ki)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getWeatherText(location) {
  const apikey = CONFIG.WEATHER_API_KEY;

  const locRes = await axios.get("https://api.accuweather.com/locations/v1/cities/search.json", {
    params: { q: location, apikey, language: "en-us" },
    timeout: 15000
  });

  if (!locRes.data || !locRes.data.length) {
    const err = new Error("LOCATION_NOT_FOUND");
    err.code = "LOCATION_NOT_FOUND";
    throw err;
  }

  const place = locRes.data[0];
  const areaName = place.LocalizedName;

  const fRes = await axios.get(`https://api.accuweather.com/forecasts/v1/daily/5day/${place.Key}`, {
    params: { apikey, details: true, language: "en" },
    timeout: 15000
  });

  const today = fRes.data.DailyForecasts[0];
  const headline = fRes.data.Headline.Text;

  const minC = convertFtoC(today.Temperature.Minimum.Value);
  const maxC = convertFtoC(today.Temperature.Maximum.Value);
  const feelMinC = convertFtoC(today.RealFeelTemperature.Minimum.Value);
  const feelMaxC = convertFtoC(today.RealFeelTemperature.Maximum.Value);

  return `🌤️ Weather in ${areaName}\n${headline}\n\n🌡 Temp: ${minC}°C – ${maxC}°C\n🤔 Feels like: ${feelMinC}°C – ${feelMaxC}°C\n🌞 Day: ${today.Day.LongPhrase}\n🌙 Night: ${today.Night.LongPhrase}`;
}

/* ===============================
   🤖 AI LOGIC
================================*/
const AI = {
  async _call(model, messages) {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      { model, messages },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const content = res.data && res.data.choices && res.data.choices[0] &&
      res.data.choices[0].message && res.data.choices[0].message.content;

    if (!content) throw new Error(`Empty/invalid AI response from model "${model}"`);
    return content;
  },

  async ask(messages) {
    try {
      return await withRetry(() => this._call(CONFIG.MODEL, messages), 1, 500);
    } catch (e) {
      console.error("⚠️ Primary model failed, trying fallback model:", e.message);
      try {
        return await this._call(CONFIG.FALLBACK_MODEL, messages);
      } catch (fallbackErr) {
        console.error("❌ Fallback model failed:", fallbackErr.message);
        throw fallbackErr;
      }
    }
  },

  async askVision(messages) {
    try {
      return await withRetry(() => this._call(CONFIG.VISION_MODEL, messages), 1, 500);
    } catch (e) {
      console.error("⚠️ Vision model failed:", e.message);
      throw e;
    }
  },

  system(mode) {
    const persona = CONFIG.MODES[mode] || CONFIG.MODES.default;
    return {
      role: "system",
      content: `
You are Nexora AI, a helpful assistant chatting inside Messenger.

Personality: ${persona}

Language rule: Detect language/script (Bangla, English, Banglish, etc.) and reply in the exact same language/script.

Response style:
- Clean prose, no ascii boxes.
- Paragraphs/bullets for long replies.
- Emojis only when appropriate.

If asked who made/built/owns you: answer "OPU SENSEI". Never mention OpenAI/Anthropic.
`
    };
  }
};

/* ===============================
   🎨 UI
================================*/
function format(reply, id, style) {
  if (style === "fancy") {
    return `╭━━〔 ✨ NEXORA AI 〕━━╮\n\n${reply}\n\n┣━━ 🧠 ${Memory.get(id).length}/${CONFIG.MAX_MEMORY}\n┣━━ 📊 ${Store.data.stats.total}\n╰━━ ⚡ Elite`;
  }
  return `🤖 NEXORA AI\n${reply}`;
}

function isCreatorQuestion(text) {
  const t = text.toLowerCase();
  return (
    /\bwho\s+(made|built|created|owns|is\s+the\s+owner\s+of)\s+you\b/.test(t) ||
    /\bwho\s+is\s+your\s+(owner|creator|developer|dev)\b/.test(t) ||
    /\byour\s+(owner|creator|developer)\s+is\s+who\b/.test(t) ||
    /\b(tomake|tomar)\s+.*\b(banaise|banaiche|toiri\s*korche|toiri\s*korchen|toiri\s*koreche)\b/.test(t) ||
    /\btomar\s+owner\s+ke\b/.test(t) ||
    /\bke\s+tomake\s+(banaise|banaiche)\b/.test(t)
  );
}

const CREATOR_REPLY = "I was built by OPU SENSEI 👑";

const HELP_TEXT = `╭━━〔 ✨ NEXORA AI HELP 〕━━╮
nexora <question>          - chat
nexora generate a <thing>  - make an image
nexora generate a <thing> --style anime  - styled image
nexora clear               - clear your memory
nexora remember <text>     - save a fact about you long-term
nexora forget              - erase everything remembered about you
nexora mode <name>         - set personality (default/funny/serious/savage)
nexora voice on / off      - toggle voice replies
nexora style clean / fancy - clean plain replies (default) or boxed look
nexora stats               - usage stats
nexora game quiz/math/riddle - play a mini game
nexora answer <text>       - answer active game question
nexora score                - check your game points
nexora search <query>      - real-time web search summary
nexora code <prompt>       - generate code
nexora upscale this image  - HD an image (reply to a photo)
nexora edit this image <prompt> - AI edit image (reply to a photo)
nexora sing <song name>    - fetch & send a song
nexora weather <city>      - weather info
[admin only]
nexora reset all           - wipe memory
nexora ban <userID>        - ban user
nexora unban <userID>      - unban user
╰━━━━━━━━━━━━━━━━━━━━━╯`;

/* ===============================
   🧩 SHARED HANDLER LOGIC
================================*/
async function handleCommand({ input, id, threadID, message, event }) {
  if (Ban.isBanned(id)) return;

  const triggerStrip = new RegExp(`^\\s*${CONFIG.TRIGGER}\\b[:,]?\\s*`, "i");
  input = input.replace(triggerStrip, "").trim();

  const lower = input.toLowerCase();
  const args = input.split(" ").filter(Boolean);
  const attachments = event.attachments;

  if (isCreatorQuestion(input)) return message.reply(CREATOR_REPLY);
  if (lower === "help") return message.reply(HELP_TEXT);

  if (lower === "clear") {
    Memory.clear(id);
    return message.reply("🧹 Memory cleared.");
  }

  if (args[0] && args[0].toLowerCase() === "remember") {
    const fact = args.slice(1).join(" ").trim();
    if (!fact || fact.length < CONFIG.MIN_PROMPT_LEN) return message.reply("Usage: nexora remember <fact>");
    Facts.add(id, fact);
    return message.reply(`🧠 Got it, I'll remember: "${fact}"`);
  }

  if (lower === "forget") {
    Facts.clear(id);
    return message.reply("🧹 Forgot everything I knew about you.");
  }

  if (args[0] && args[0].toLowerCase() === "game") {
    const type = (args[1] || "").toLowerCase();
    if (type === "quiz") return startQuiz(message, id);
    if (type === "math") return startMath(message, id);
    if (type === "riddle") return startRiddle(message, id);
    return message.reply("🎮 Usage: nexora game quiz | math | riddle");
  }

  if (args[0] && args[0].toLowerCase() === "answer") {
    const rawAnswer = args.slice(1).join(" ");
    if (!rawAnswer) return message.reply("Usage: nexora answer <answer>");
    return checkGameAnswer(message, id, rawAnswer);
  }

  if (lower === "score" || lower === "scores") {
    return message.reply(`🏆 Your game score: ${Game.score(id)} points`);
  }

  if (args[0] && args[0].toLowerCase() === "search") {
    const query = args.slice(1).join(" ").trim();
    if (!query) return message.reply("🔎 Usage: nexora search <question>");
    if (Cooldown.checkUser(id)) return;
    return handleSearch(message, query, id);
  }

  if (args[0] && args[0].toLowerCase() === "code") {
    const codePrompt = args.slice(1).join(" ").trim();
    if (!codePrompt) return message.reply("💻 Usage: nexora code <prompt>");
    if (Cooldown.checkUser(id)) return;
    return handleCodeGen(message, codePrompt, id);
  }

  if (lower === "stats") {
    const u = Store.data.stats.users[id] || 0;
    return message.reply(
      `📊 Your messages: ${u}\n📊 Total bot messages: ${Store.data.stats.total}\n🧠 Memory: ${Memory.get(id).length}/${CONFIG.MAX_MEMORY}\n🗂️ Facts: ${Facts.get(id).length}/${CONFIG.MAX_FACTS}\n🏆 Score: ${Game.score(id)}`
    );
  }

  if (args[0] && args[0].toLowerCase() === "mode") {
    const wanted = (args[1] || "").toLowerCase();
    if (!wanted) return message.reply(`Modes: ${Object.keys(CONFIG.MODES).join(", ")}`);
    if (!CONFIG.MODES[wanted]) return message.reply(`⚠️ Unknown mode. Options: ${Object.keys(CONFIG.MODES).join(", ")}`);
    Store.user(id).mode = wanted;
    Store.save();
    return message.reply(`🎭 Mode set to: ${wanted}`);
  }

  if (args[0] && args[0].toLowerCase() === "voice") {
    const wanted = (args[1] || "").toLowerCase();
    if (wanted !== "on" && wanted !== "off") return message.reply("Usage: nexora voice on|off");
    Store.user(id).voice = wanted === "on";
    Store.save();
    return message.reply(`🔊 Voice replies: ${wanted}`);
  }

  if (args[0] && args[0].toLowerCase() === "style") {
    const wanted = (args[1] || "").toLowerCase();
    if (wanted !== "clean" && wanted !== "fancy") return message.reply("Usage: nexora style clean|fancy");
    Store.user(id).style = wanted;
    Store.save();
    return message.reply(`🎨 Reply style: ${wanted}`);
  }

  // Admin commands
  if (args[0] && args[0].toLowerCase() === "reset" && args[1] && args[1].toLowerCase() === "all") {
    if (!isAdmin(id)) return message.reply("⛔ Admins only.");
    Memory.clearAll();
    return message.reply("🧹 All memory wiped.");
  }

  if (args[0] && args[0].toLowerCase() === "ban") {
    if (!isAdmin(id)) return message.reply("⛔ Admins only.");
    const target = args[1];
    if (!target) return message.reply("Usage: nexora ban <userID>");
    Ban.ban(target);
    return message.reply(`🚫 Banned ${target}`);
  }

  if (args[0] && args[0].toLowerCase() === "unban") {
    if (!isAdmin(id)) return message.reply("⛔ Admins only.");
    const target = args[1];
    if (!target) return message.reply("Usage: nexora unban <userID>");
    Ban.unban(target);
    return message.reply(`✅ Unbanned ${target}`);
  }

  const targetImg = getTargetImageUrl(event);

  if (targetImg && isUpscaleRequest(input)) {
    if (Cooldown.checkUser(id)) return;
    return upscaleImage(message, targetImg);
  }

  if (targetImg && isEditImageRequest(input)) {
    const editPrompt = extractEditPrompt(input);
    if (!editPrompt || editPrompt.length < CONFIG.MIN_PROMPT_LEN) return message.reply("⚠️ Tell me how to edit it.");
    if (Cooldown.checkUser(id)) return;
    return editImage(message, targetImg, editPrompt);
  }

  if (!targetImg && /\bupscale\b/i.test(input)) {
    return message.reply("⚠️ Reply to an image with that, or attach one.");
  }
  if (!targetImg && /\bedit\s+this\s+image\b/i.test(input)) {
    return message.reply("⚠️ Reply to an image with your edit instruction.");
  }

  if (isSongRequest(input)) {
    const query = extractSongQuery(input);
    if (Cooldown.checkUser(id)) return;
    return sendSong(message, query);
  }

  if (isWeatherRequest(input)) {
    const location = extractWeatherLocation(input);
    if (!location || location.length < CONFIG.MIN_PROMPT_LEN) return message.reply("📍 Specify location, e.g. nexora weather Dhaka");
    if (Cooldown.checkUser(id)) return;

    try {
      let text = await getWeatherText(location);
      if (Store.user(id).voice) return sendVoice(message, text);
      return message.reply(text);
    } catch (e) {
      if (e.code === "LOCATION_NOT_FOUND") return message.reply(`❌ Location not found: ${location}`);
      console.error("❌ Weather error:", e.message);
      return message.reply("❌ Couldn't fetch weather right now.");
    }
  }

  if (attachments && attachments.length && attachments[0].type === "photo") {
    if (Cooldown.checkUser(id)) return;
    if (Cooldown.checkGroup(threadID)) return;

    const imageUrl = attachments[0].url;
    const question = input || "Describe this image.";

    try {
      const reply = await AI.askVision([
        AI.system(Store.user(id).mode),
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]);

      Stats.add(id);
      if (Store.user(id).voice) return sendVoice(message, reply);
      return message.reply(`🤖 NEXORA AI\n${reply}`);
    } catch (e) {
      return message.reply("❌ Couldn't analyze that image right now.");
    }
  }

  if (isImageRequest(input)) {
    const { prompt, style } = extractImagePrompt(input);
    return sendImage(message, prompt, style);
  }

  if (Cooldown.checkUser(id)) return;
  if (Cooldown.checkGroup(threadID)) return;

  Memory.add(id, "user", input);
  Stats.add(id);

  try {
    const facts = Facts.get(id);
    const chatMessages = [AI.system(Store.user(id).mode)];
    if (facts.length) {
      chatMessages.push({
        role: "system",
        content: `Known facts about this user: ${facts.map(f => f.text).join("; ")}`
      });
    }
    chatMessages.push(...Memory.get(id));

    const reply = await AI.ask(chatMessages);

    Memory.add(id, "assistant", reply);

    if (Store.user(id).voice) return sendVoice(message, reply);
    return message.reply(format(reply, id, Store.user(id).style));

  } catch (e) {
    console.error("❌ Nexora AI error:", e.message);
    return message.reply("❌ API error, try again in a moment.");
  }
}

/* ===============================
   📦 EXPORT
================================*/
module.exports = {
  config: {
    name: "nexora",
    version: "FINAL-ULTRA-V2",
    author: "OPUSENSEI",
    category: "ai"
  },

  async onStart({ message, args, event }) {
    const id = event.senderID;
    const threadID = event.threadID;
    const input = args.join(" ").trim();

    if (!input && !(event.attachments && event.attachments.length)) {
      return message.reply("⚠️ Ask something, or type 'nexora help'.");
    }

    return handleCommand({
      input,
      id,
      threadID,
      message,
      event
    });
  },

  async onChat({ event, message, api }) {
    const id = event.senderID;
    const threadID = event.threadID;
    const body = event.body || "";
    const text = body.toLowerCase();

    const saidTrigger = text.includes(CONFIG.TRIGGER);

    let isReplyToBot = false;
    if (event.type === "message_reply" && event.messageReply) {
      let botID = CONFIG.BOT_ID;
      try {
        if (api && typeof api.getCurrentUserID === "function") {
          botID = api.getCurrentUserID();
        }
      } catch (e) {}

      if (botID && String(event.messageReply.senderID) === String(botID)) {
        isReplyToBot = true;
      }
    }

    if (!saidTrigger && !isReplyToBot) return;

    return handleCommand({
      input: body,
      id,
      threadID,
      message,
      event
    });
  }
};
