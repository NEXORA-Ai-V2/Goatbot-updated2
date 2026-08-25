const axios = require("axios");
const fs = require("fs");

function getCacheDir() {
  const dir = __dirname + "/cache";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function downloadImage(url, filePath) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "image/*,*/*;q=0.8"
    }
  });
  fs.writeFileSync(filePath, Buffer.from(res.data, "binary"));
  return filePath;
}

module.exports = {
  config: {
    name: "midjourney",
    aliases: ["mj"],
    version: "1.1",
    author: "opu sensei",
    countDown: 10,
    role: 0,
    shortDescription: "Midjourney style image generator",
    longDescription: "Generate AI images (Midjourney style) from a text prompt, then reply U1-U4 to get a single image from the set",
    category: "ai",
    guide: {
      en: "{pn} <prompt> | <ratio>\nExample:\n{pn} a female warrior standing in a ruined city, dark fantasy\n{pn} a cyberpunk city at night | 16:9\n\nAfter the images are sent, reply to that message with U1, U2, U3, or U4 to get that specific image."
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const input = args.join(" ").trim();

    if (!input) {
      return message.reply(
        "Please provide a prompt.\nExample: mj a female warrior standing in a ruined city, dark fantasy"
      );
    }

    let prompt = input;
    let ratio = "";

    if (input.includes("|")) {
      const parts = input.split("|");
      prompt = parts[0].trim();
      ratio = parts[1] ? parts[1].trim() : "";
    }

    const waitMessage = await message.reply("✨ Mj Generating your images, please wait...");

    try {
      const apiUrl = "https://toshiro-api-editz6t9.vercel.app/api/image/mj";

      const params = { prompt };
      if (ratio) params.ratio = ratio;

      const response = await axios.get(apiUrl, { params, timeout: 120000 });
      const data = response.data;

      if (!data || data.success !== true) {
        throw new Error("API did not return a successful response.");
      }

      const result = data.result || {};

      // Try to collect up to 4 image URLs from common response shapes
      let images = [];
      if (Array.isArray(result.images)) {
        images = result.images;
      } else if (Array.isArray(result.urls)) {
        images = result.urls;
      } else if (Array.isArray(data.images)) {
        images = data.images;
      } else {
        const single =
          result.image || result.url || result.image_url || result.output;
        if (single) images = [single];
      }

      if (!images.length) {
        return message.reply("Image generation failed: no image returned by the API.");
      }

      images = images.slice(0, 4);

      const cacheDir = getCacheDir();
      const localPaths = [];
      for (let i = 0; i < images.length; i++) {
        const p = cacheDir + `/mj_${Date.now()}_${i + 1}.png`;
        await downloadImage(images[i], p);
        localPaths.push(p);
      }

      const attachments = localPaths.map((p) => fs.createReadStream(p));

      const sent = await message.reply({
        body: `Done! Generated ${images.length} image(s).\n\nPrompt: ${prompt}\n\nReply with U1${images.length > 1 ? `-U${images.length}` : ""} to get a specific image.`,
        attachment: attachments
      });

      // Clean up local temp files
      for (const p of localPaths) {
        try {
          fs.unlinkSync(p);
        } catch (e) {}
      }

      // Register reply listener so the user can pick U1-U4
      global.GoatBot.onReply.set(sent.messageID, {
        commandName: this.config.name,
        messageID: sent.messageID,
        author: event.senderID,
        images: images,
        prompt: prompt
      });
    } catch (error) {
      console.log("MJ command error:", error);
      const detail = (error && error.message) ? error.message : "Unknown error";
      message.reply(`Failed to generate image. Please try again later.\n\nDetail: ${detail}`);
    } finally {
      if (waitMessage && waitMessage.messageID) {
        api.unsendMessage(waitMessage.messageID);
      }
    }
  },

  onReply: async function ({ api, event, Reply, message }) {
    if (event.senderID != Reply.author) {
      return message.reply("Only the person who requested this image set can select one.");
    }

    const body = (event.body || "").trim().toUpperCase();
    const match = body.match(/^U([1-4])$/);

    if (!match) {
      return message.reply(`Reply with U1${Reply.images.length > 1 ? `-U${Reply.images.length}` : ""} to select an image.`);
    }

    const index = parseInt(match[1], 10) - 1;
    const url = Reply.images[index];

    if (!url) {
      return message.reply("That image number doesn't exist in this set.");
    }

    try {
      const cacheDir = getCacheDir();
      const p = cacheDir + `/mj_u_${Date.now()}.png`;
      await downloadImage(url, p);

      await message.reply({
        body: `Here is image U${index + 1}\n\nPrompt: ${Reply.prompt}`,
        attachment: fs.createReadStream(p)
      });

      fs.unlinkSync(p);
    } catch (error) {
      console.log("MJ onReply error:", error);
      const detail = (error && error.message) ? error.message : "Unknown error";
      message.reply(`Failed to fetch that image. Please try again.\n\nDetail: ${detail}`);
    }
  }
};
    
