const axios = require('axios');

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
    message.reply("⚡ Image Generator is generating your image. Please wait...", async (err) => {
      if (err) return console.error(err);

      try {
        const apiUrl = `https://toshiro-api-editz6t9.vercel.app/api/image/msai?prompt=${encodeURIComponent(prompt)}`;
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        const buffer = Buffer.from(response.data);
        const stream = require('stream');
        const imageStream = new stream.PassThrough();
        imageStream.end(buffer);

        api.setMessageReaction("✅", event.messageID, () => {}, true);
        message.reply({
          body: `✅ Here is your AI generated image for: "${prompt}"`,
          attachment: imageStream
        });

      } catch (error) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        console.error(error.response?.data || error.message);
        message.reply("❌ An error occurred while generating the image. Please try again.");
      }
    });
  }
};
