const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const jimp = require("jimp");

module.exports = {
  config: {
    name: "married",
    aliases: ["marriedv5"],
    version: "1.0.1",
    author: "sasuke",
    countDown: 5,
    role: 0,
    shortDescription: "Get married image with someone",
    longDescription: "Generate married image by mentioning someone or replying to their message",
    category: "fun",
    guide: "{pn} @mention or reply to a message"
  },

  onStart: async function () {
    const { resolve } = require("path");
    const { existsSync, mkdirSync } = require("fs-extra");
    const { downloadFile } = global.utils || {};

    const dirMaterial = resolve(__dirname, "cache", "canvas");
    const bgPath = resolve(dirMaterial, "marriedv5.png");

    if (!existsSync(dirMaterial)) {
      mkdirSync(dirMaterial, { recursive: true });
    }

    if (!existsSync(bgPath)) {
      if (downloadFile) {
        await downloadFile("https://i.ibb.co/mhxtgwm/49be174dafdc259030f70b1c57fa1c13.jpg", bgPath);
      } else {
        const response = await axios.get("https://i.ibb.co/mhxtgwm/49be174dafdc259030f70b1c57fa1c13.jpg", { responseType: "arraybuffer" });
        fs.writeFileSync(bgPath, Buffer.from(response.data));
      }
    }
  },

  circle: async function (imageBuffer) {
    const image = await jimp.read(imageBuffer);
    image.circle();
    return await image.getBufferAsync("image/png");
  },

  makeImage: async function ({ one, two, avatarURL1, avatarURL2 }) {
    const __root = path.resolve(__dirname, "cache", "canvas");
    fs.ensureDirSync(__root);

    const bgPath = path.join(__root, "marriedv5.png");
    let batgiam_img = await jimp.read(bgPath);

    let pathImg = path.join(__root, `married_${one}_${two}.png`);

    let res1 = await axios.get(avatarURL1, { responseType: "arraybuffer" });
    let res2 = await axios.get(avatarURL2, { responseType: "arraybuffer" });

    let circleOneBuf = await this.circle(Buffer.from(res1.data));
    let circleTwoBuf = await this.circle(Buffer.from(res2.data));

    let circleOne = await jimp.read(circleOneBuf);
    let circleTwo = await jimp.read(circleTwoBuf);

    batgiam_img
      .composite(circleOne.resize(130, 130), 300, 150)
      .composite(circleTwo.resize(130, 130), 170, 230);

    let raw = await batgiam_img.getBufferAsync("image/png");
    fs.writeFileSync(pathImg, raw);

    return pathImg;
  },

  onStart: async function ({ event, api, usersData, message }) {
    const { threadID, messageID, senderID } = event;
    const mentions = Object.keys(event.mentions || {});

    let one = senderID;
    let two;

    if (mentions.length > 0) {
      two = mentions[0];
    } else if (event.type === "message_reply" || event.messageReply) {
      two = event.messageReply.senderID;
    } else {
      return api.sendMessage("Please mention someone or reply to a message.", threadID, messageID);
    }

    try {
      const avatarURL1 = await usersData.getAvatarUrl(one);
      const avatarURL2 = await usersData.getAvatarUrl(two);

      const pathSave = await this.makeImage({ one, two, avatarURL1, avatarURL2 });

      return api.sendMessage(
        {
          body: "",
          attachment: fs.createReadStream(pathSave)
        },
        threadID,
        () => {
          if (fs.existsSync(pathSave)) {
            fs.unlinkSync(pathSave);
          }
        },
        messageID
      );
    } catch (error) {
      console.error("Married command error:", error);
      return api.sendMessage("An error occurred while generating the image. Please try again!", threadID, messageID);
    }
  }
};
