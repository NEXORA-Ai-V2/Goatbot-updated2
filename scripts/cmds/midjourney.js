const axios = require("axios");
const { getStreamFromURL } = global.utils;
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

module.exports = {
  config: {
    name: "midjourney",
    aliases: ["mj"],
    version: "3.0",
    author: "opu sensei",
    countDown: 10,
    role: 0,
    shortDescription: "Generate MJ images",
    longDescription: "Generate AI images with ratio support",
    category: "ai",
    guide: {
      en: "{pn} <prompt> --ar 1:1 / 16:9 / 9:16"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    let input = args.join(" ").trim();
    if (!input) return message.reply("❌ Prompt dao");

    // 🎯 Ratio parse
    let ratio = "1:1";
    const ratioMatch = input.match(/--ar\s*(\d+:\d+)/);
    if (ratioMatch) {
      ratio = ratioMatch[1];
      input = input.replace(ratioMatch[0], "").trim();
    }

    api.setMessageReaction("⌛", event.messageID, () => {}, true);

    try {
      const apiUrl = `https://toshiro-api-editz6t9.vercel.app/api/image/mj?prompt=${encodeURIComponent(input)}&ar=${ratio}`;
      
      const res = await axios.get(apiUrl, { timeout: 20000 });

      const data = res.data;

      if (!data || !data.result || !Array.isArray(data.result.images)) {
        throw new Error("Invalid API response");
      }

      const images = data.result.images.slice(0, 4);

      // 🛡 fallback: direct send if canvas fail
      let imageObjs;
      try {
        imageObjs = await Promise.all(images.map(url => loadImage(url)));
      } catch (err) {
        console.log("Canvas load failed → fallback send");

        const streams = await Promise.all(
          images.map(url => getStreamFromURL(url))
        );

        return message.reply({
          body: `✅ Generated (Ratio: ${ratio})`,
          attachment: streams
        });
      }

      // 🎨 Canvas size based on ratio
      let width = 1024, height = 1024;

      if (ratio === "16:9") {
        width = 1024;
        height = 576;
      } else if (ratio === "9:16") {
        width = 576;
        height = 1024;
      }

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      const halfW = width / 2;
      const halfH = height / 2;

      ctx.drawImage(imageObjs[0], 0, 0, halfW, halfH);
      ctx.drawImage(imageObjs[1], halfW, 0, halfW, halfH);
      ctx.drawImage(imageObjs[2], 0, halfH, halfW, halfH);
      ctx.drawImage(imageObjs[3], halfW, halfH, halfW, halfH);

      // save
      const cacheDir = path.join(__dirname, "cache");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

      const filePath = path.join(cacheDir, `mj_${event.senderID}.png`);
      const out = fs.createWriteStream(filePath);

      canvas.createPNGStream().pipe(out);

      out.on("finish", () => {
        api.setMessageReaction("✅", event.messageID, () => {}, true);

        message.reply({
          body: `✅ Done!\nRatio: ${ratio}\nReply U1/U2/U3/U4`,
          attachment: fs.createReadStream(filePath)
        }, (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            author: event.senderID,
            results: images
          });
        });
      });

    } catch (err) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      console.error(err.message);

      message.reply("❌ API error / server down. Try again later.");
    }
  },

  onReply: async function ({ event, Reply, message }) {
    if (event.senderID !== Reply.author) {
      return message.reply("❌ Only owner select korte parbe");
    }

    const match = event.body.toUpperCase().match(/^U([1-4])$/);
    if (!match) return message.reply("Reply U1-U4");

    const index = parseInt(match[1]) - 1;

    try {
      const stream = await getStreamFromURL(Reply.results[index]);

      message.reply({
        body: `✅ Selected U${index + 1}`,
        attachment: stream
      });

    } catch {
      message.reply("❌ Load fail");
    }
  }
};
