const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "fight",
    aliases: ["punch"],
    version: "1.1",
    author: "opu",
    countDown: 5,
    role: 0,
    shortDescription: "Fight someone",
    longDescription: "Send a funny fight GIF or message",
    category: "fun",
    guide: "{pn} @mention",
  },

  onStart: async function ({ api, event, usersData }) {
    const { threadID, messageID, senderID, mentions } = event;

    // ❌ No mention
    if (!mentions || Object.keys(mentions).length === 0) {
      return api.sendMessage("👊 Tag someone to fight with!", threadID, messageID);
    }

    const mentionID = Object.keys(mentions)[0];

    const user1 = await usersData.getName(senderID);
    const user2 = mentions[mentionID].replace("@", ""); // clean name

    const fightMessages = [
      `${user1} punched ${user2} hard! 💥`,
      `${user1} threw a kick at ${user2} 🦵`,
      `${user1} and ${user2} are fighting! 🥊🥊`,
      `${user1} did a WWE slam on ${user2} 😱`
    ];

    const result = fightMessages[Math.floor(Math.random() * fightMessages.length)];

    const gifUrl = "https://media.giphy.com/media/xT0GqssRweIhlz209i/giphy.gif";

    // temp folder ensure
    const cachePath = path.join(__dirname, "cache");
    const gifPath = path.join(cachePath, "fight.gif");

    try {
      await fs.ensureDir(cachePath);

      const response = await axios.get(gifUrl, {
        responseType: "arraybuffer"
      });

      // ✅ FIX: no utf-8 encoding
      fs.writeFileSync(gifPath, Buffer.from(response.data));

      api.sendMessage(
        {
          body: result,
          attachment: fs.createReadStream(gifPath)
        },
        threadID,
        () => fs.unlinkSync(gifPath),
        messageID
      );

    } catch (err) {
      console.error(err);
      return api.sendMessage(result, threadID, messageID);
    }
  }
};
