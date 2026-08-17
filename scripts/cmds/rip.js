const DIG = require("discord-image-generation");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "rip",
    version: "1.1.1",
    author: "dipto | opu",
    countDown: 5,
    role: 0,
    shortDescription: "rip image",
    longDescription: "rip image",
    category: "fun",
    guide: {
      vi: "{pn} [@tag | blank]",
      en: "{pn} [@tag | reply]"
    }
  },

  onStart: async function ({ event, message, usersData }) {
    let uid;
    const mentions = Object.keys(event.mentions || {});

    if (mentions.length > 0) {
      uid = mentions[0];
    } else if (event.type === "message_reply" || event.messageReply) {
      uid = event.messageReply.senderID;
    } else {
      return message.reply("Please mention someone or reply to a message!");
    }

    try {
      const avatarURL = await usersData.getAvatarUrl(uid);
      const img = await new DIG.Rip().getImage(avatarURL);

      const tmpDir = path.join(__dirname, "tmp");
      fs.ensureDirSync(tmpDir);

      const pathSave = path.join(tmpDir, `${uid}_Rip.png`);
      fs.writeFileSync(pathSave, Buffer.from(img));

      return message.reply(
        {
          attachment: fs.createReadStream(pathSave)
        },
        () => {
          if (fs.existsSync(pathSave)) {
            fs.unlinkSync(pathSave);
          }
        }
      );
    } catch (error) {
      console.error("RIP command error:", error);
      return message.reply("An error occurred while generating the image. Please try again!");
    }
  }
};
