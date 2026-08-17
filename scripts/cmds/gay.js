const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "gay",
    aliases: [],
    version: "1.6.1",
    author: "NeoKEX | Opu",
    countDown: 2,
    role: 0,
    description: "Generate a gay image with two user IDs.",
    category: "fun",
    guide: {
      en: "{pn} @mention @mention\nOr {pn} @mention\nOr reply to a message."
    }
  },

  onStart: async function ({ api, event, usersData }) {
    try {
      const mentions = Object.keys(event.mentions || {});
      let uid1, uid2;
      let uid1Name = "", uid2Name = "";

      // Case 1: Two or more mentions
      if (mentions.length >= 2) {
        uid1 = mentions[0];
        uid2 = mentions[1];
        uid1Name = typeof event.mentions[uid1] === "string" ? event.mentions[uid1] : (event.mentions[uid1]?.name || "User 1");
        uid2Name = typeof event.mentions[uid2] === "string" ? event.mentions[uid2] : (event.mentions[uid2]?.name || "User 2");
      }
      // Case 2: One mention
      else if (mentions.length === 1) {
        uid1 = event.senderID;
        uid2 = mentions[0];
        
        if (usersData && usersData.getName) {
          uid1Name = await usersData.getName(uid1);
        } else {
          const userInfo = await api.getUserInfo(uid1);
          uid1Name = userInfo[uid1]?.name || "User";
        }
        
        uid2Name = typeof event.mentions[uid2] === "string" ? event.mentions[uid2] : (event.mentions[uid2]?.name || "User");
      }
      // Case 3: Reply to a message
      else if (event.type === "message_reply" || event.messageReply) {
        uid1 = event.senderID;
        uid2 = event.messageReply.senderID;

        if (usersData && usersData.getName) {
          uid1Name = await usersData.getName(uid1);
          uid2Name = await usersData.getName(uid2);
        } else {
          const userInfo = await api.getUserInfo([uid1, uid2]);
          uid1Name = userInfo[uid1]?.name || "User 1";
          uid2Name = userInfo[uid2]?.name || "User 2";
        }
      }
      // Case 4: No mention or reply
      else {
        return api.sendMessage("Please reply to a message or mention one or two users.", event.threadID, event.messageID);
      }

      // Format name tags if they were returned containing @ symbol
      uid1Name = uid1Name.replace(/@/g, "");
      uid2Name = uid2Name.replace(/@/g, "");

      const url = `https://neokex-apis.onrender.com/gay?uid1=${uid1}&uid2=${uid2}`;
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      
      const cacheDir = path.join(__dirname, "cache");
      fs.ensureDirSync(cacheDir);

      const filePath = path.join(cacheDir, `gay_${uid1}_${uid2}.jpg`);
      fs.writeFileSync(filePath, Buffer.from(response.data));

      const messageBody = `Oh yeah ${uid1Name} 💋 ${uid2Name}`;
      const messageMentions = [
        { tag: uid1Name, id: uid1 },
        { tag: uid2Name, id: uid2 }
      ];

      return api.sendMessage({
        body: messageBody,
        attachment: fs.createReadStream(filePath),
        mentions: messageMentions
      }, event.threadID, () => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, event.messageID);

    } catch (e) {
      console.error("Error:", e.message);
      return api.sendMessage("❌ Couldn't generate image. Try again later.", event.threadID, event.messageID);
    }
  }
};
