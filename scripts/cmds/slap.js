const DIG = require("discord-image-generation");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "slap",
    version: "1.1.2",
    author: "Maxamit & Opu",
    countDown: 5,
    role: 0,
    shortDescription: "Batslap image generator",
    longDescription: "Generate a batslap meme image mentioning or replying to someone",
    category: "fun",
    guide: {
      en: "{pn} @mention or reply to a message"
    }
  },

  langs: {
    en: {
      noTag: "Please mention or reply to the person you want to slap! 🖐️"
    }
  },

  onStart: async function ({ event, message, usersData, args, getLang }) {
    const uid1 = event.senderID;
    let uid2;

    const mentions = Object.keys(event.mentions || {});

    if (mentions.length > 0) {
      uid2 = mentions[0];
    } else if (event.type === "message_reply" || event.messageReply) {
      uid2 = event.messageReply.senderID;
    } else {
      return message.reply(getLang("noTag"));
    }

    try {
      const avatarURL1 = await usersData.getAvatarUrl(uid1);
      const avatarURL2 = await usersData.getAvatarUrl(uid2);

      const img = await new DIG.Batslap().getImage(avatarURL1, avatarURL2);

      const tmpDir = path.join(__dirname, "tmp");
      fs.ensureDirSync(tmpDir);

      const pathSave = path.join(tmpDir, `${uid1}_${uid2}_Batslap.png`);
      fs.writeFileSync(pathSave, Buffer.from(img));

      // Cleaning up the mention string from extra command arguments
      let customText = args.join(' ');
      if (mentions.length > 0) {
        customText = customText.replace(new RegExp(`@?${mentions[0]}`, 'g'), '').trim();
      }

      return message.reply(
        {
          body: customText || "Slap! 💥😵‍💫",
          attachment: fs.createReadStream(pathSave)
        },
        () => {
          if (fs.existsSync(pathSave)) {
            fs.unlinkSync(pathSave);
          }
        }
      );
    } catch (error) {
      console.error("Slap command error:", error);
      return message.reply("An error occurred while generating the image. Please try again!");
    }
  }
};
