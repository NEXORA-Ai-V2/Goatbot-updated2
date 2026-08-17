const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const https = require("https");

module.exports = {
  config: {
    name: "fakechat",
    version: "1.4.1",
    author: "Chitron Bhattacharjee",
    countDown: 5,
    role: 0,
    aliases: ["chatedit", "fchat"],
    shortDescription: {
      en: "Generate fake Messenger screenshot"
    },
    description: {
      en: "Create a fake Messenger screenshot with UID/mention and custom messages"
    },
    category: "fun",
    guide: {
      en: "{pn} @mention - <text1> - [text2] - [dark/light]\nOr reply to a message: {pn} <text1> - [text2] - [dark/light]\n\nEach use costs 50 coins."
    }
  },

  onStart: async function ({ args, message, event, api, usersData }) {
    if (args.length < 1) {
      return message.reply("⚠️ Usage:\n+fakechat <@mention or reply> - <text1> - [text2] - [mode]");
    }

    let uid;
    let rawInput = args.join(" ");

    // 1. Check Mentions
    const mentions = Object.keys(event.mentions || {});
    if (mentions.length > 0) {
      uid = mentions[0];
      // Tag remove from input to isolate text parameters
      const mentionTag = event.mentions[uid];
      const mentionName = typeof mentionTag === "string" ? mentionTag : mentionTag?.name || "";
      if (mentionName) {
        rawInput = rawInput.replace(new RegExp(`@?${mentionName}`, 'gi'), '').trim();
      } else {
        rawInput = rawInput.replace(/<@!?\d+>/g, '').trim();
      }
    } 
    // 2. Check Message Reply
    else if (event.type === "message_reply" || event.messageReply) {
      uid = event.messageReply.senderID;
    } 
    // 3. Check direct UID passed as first argument
    else if (/^\d{6,}$/.test(args[0])) {
      uid = args[0];
      rawInput = args.slice(1).join(" ");
    } else {
      return message.reply("❌ Please mention someone, reply to a message, or provide a valid UID.");
    }

    // Split parameters by '-'
    const inputParts = rawInput.split("-").map(i => i.trim()).filter(Boolean);

    if (inputParts.length < 1) {
      return message.reply("⚠️ Please provide at least one text. Example: +fakechat @user - hello - hi - dark");
    }

    const text1 = inputParts[0];
    const text2 = inputParts[1] && !["dark", "light"].includes(inputParts[1].toLowerCase()) ? inputParts[1] : "";
    
    // Determine dark/light mode
    let modeRaw = inputParts[inputParts.length - 1]?.toLowerCase();
    const mode = modeRaw === "dark" ? "dark" : "light";

    // Get User Name
    let name = "User";
    try {
      if (usersData && usersData.getName) {
        name = await usersData.getName(uid);
      } else {
        const userInfo = await api.getUserInfo(uid);
        name = userInfo[uid]?.name || "User";
      }
    } catch (e) {
      name = "User";
    }

    // 💸 Check and deduct 50 coins
    const balance = (await usersData.get(event.senderID, "money")) || 0;
    if (balance < 50) {
      return message.reply("❌ You need at least 50 coins to use this command.");
    }
    await usersData.set(event.senderID, { money: balance - 50 });

    // Prepare API
    const apiURL = `https://fchat-5pni.onrender.com/fakechat?uid=${encodeURIComponent(uid)}&name=${encodeURIComponent(name)}&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}&mode=${mode}`;

    const cacheDir = path.join(__dirname, "tmp");
    fs.ensureDirSync(cacheDir);

    const cachePath = path.join(cacheDir, `fchat_${event.senderID}_${Date.now()}.png`);

    const file = fs.createWriteStream(cachePath);
    https.get(apiURL, res => {
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          return message.reply(
            {
              body: `🎭 Fake Chat Created\n👤 Name: ${name}\n💬 Text1: ${text1}${text2 ? `\n💬 Text2: ${text2}` : ""}\n🎨 Mode: ${mode.toUpperCase()}\n💸 -50 coins`,
              attachment: fs.createReadStream(cachePath)
            },
            () => {
              if (fs.existsSync(cachePath)) {
                fs.unlinkSync(cachePath);
              }
            }
          );
        });
      });
    }).on("error", err => {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
      return message.reply("❌ Failed to generate fake chat.");
    });
  }
};
