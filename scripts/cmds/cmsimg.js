const axios = require('axios');
const stream = require('stream');

module.exports = {
  config: {
    name: "cmsimg",
    aliases: ["cmsai", "msai"],
    version: "1.0",
    author: "opu sensei",
    countDown: 10,
    longDescription: {
      en: "Generate AI images using Canva Magic Studio."
    },
    category: "ai",
    role: 0,
    guide: {
      en: "{pn} <prompt>"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const prompt = args.join(' ').trim();
    if (!prompt) return message.reply("❌ Please provide a prompt to generate the image.");

    api.setMessageReaction("⌛", event.messageID, () => {}, true);

    try {
      message.reply("🫟 canva magic studio is generating your image. Please wait...");

      const apiUrl = `https://toshiro-api-editz6t9.vercel.app/api/image/msai?prompt=${encodeURIComponent(prompt)}`;
      const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

      const buffer = Buffer.from(response.data);
      const imageStream = new stream.PassThrough();
      imageStream.end(buffer);
      imageStream.path = "image.png"; // Facebook API এর জন্য ফাইল নাম/এক্সটেনশন প্রয়োজন

      api.setMessageReaction("✅", event.messageID, () => {}, true);
      return message.reply({
        body: `✅ Here is your AI generated image for: "${prompt}"`,
        attachment: imageStream
      });

    } catch (error) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      const errDetails = error.response?.data ? Buffer.from(error.response.data).toString() : error.message;
      console.error("CMSIMG Command Error:", errDetails);
      return message.reply("❌ An error occurred while generating the image. Please try again.");
    }
  }
};
