const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

module.exports = {
  config: {
    name: "kiss",
    version: "1.0.12",
    author: "opu sensei",
    countDown: 5,
    role: 0,
    longDescription: "{p}kiss @mention or reply someone you want to kiss that person 😚",
    category: "fun",
    guide: "{p}kiss and mention someone you want to kiss 😘",
    usePrefix: true, // set to false if you want no prefix
    premium: false,
    notes: "If you change the author then the command will not work and not usable"
  },

  onStart: async function ({ api, message, event, usersData }) {
    const owner = module.exports.config;
    const eAuth = "UmFraWIgQWRpbA==";
    const dAuth = Buffer.from(eAuth, "base64").toString("utf8");

    if (owner.author !== dAuth) {
      return message.reply("you've changed the author name, please set it to default(Rakib Adil) otherwise this command will not work.🙂");
    }

    let one = event.senderID;
    let two;
    const mention = Object.keys(event.mentions || {});

    if (mention.length > 0) {
      two = mention[0];
    } else if (event.type === "message_reply") {
      two = event.messageReply.senderID;
    } else {
      return message.reply("please mention or reply someone message to kiss him/her 🌚");
    }

    try {
      const avatarURL1 = await usersData.getAvatarUrl(one);
      const avatarURL2 = await usersData.getAvatarUrl(two);

      const canvas = createCanvas(950, 850);
      const ctx = canvas.getContext("2d");

      const background = await loadImage("https://files.catbox.moe/6qg782.jpg");
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      const avatar1 = await loadImage(avatarURL1);
      const avatar2 = await loadImage(avatarURL2);

      // User 1 Avatar (Sender)
      ctx.save();
      ctx.beginPath();
      ctx.arc(725, 250, 85, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar1, 640, 170, 170, 170);
      ctx.restore();

      // User 2 Avatar (Kiss Target)
      ctx.save();
      ctx.beginPath();
      ctx.arc(175, 370, 85, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar2, 90, 280, 170, 170);
      ctx.restore();

      const dirPath = path.join(__dirname, "tmp");
      fs.ensureDirSync(dirPath);

      const outputPath = path.join(dirPath, `kiss_${one}_${two}.png`);
      const buffer = canvas.toBuffer("image/png");

      fs.writeFileSync(outputPath, buffer);

      return message.reply(
        {
          body: "Ummmmaaaaahhh! 😽😘",
          attachment: fs.createReadStream(outputPath)
        },
        () => {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        }
      );
    } catch (error) {
      console.error(error);
      return message.reply("An error occurred, please try again later.🐸");
    }
  }
};
