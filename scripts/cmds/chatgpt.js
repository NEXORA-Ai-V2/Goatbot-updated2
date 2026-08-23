const axios = require('axios');

module.exports = {
  config: {
    name: "chatgpt",
    aliases: ["gpt", "chatai"],
    version: "1.0",
    author: "opu sensei",
    countDown: 5,
    longDescription: {
      en: "Chat with ChatGPT AI."
    },
    category: "ai",
    role: 0,
    guide: {
      en: "{pn} <your message>"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const prompt = args.join(' ').trim();
    if (!prompt) return message.reply("❌ Please provide a message to send to ChatGPT.");

    api.setMessageReaction("⌛", event.messageID, () => {}, true);

    try {
      const apiUrl = `https://toshiro-api-editz6t9.vercel.app/api/ai/chatgpt?prompt=${encodeURIComponent(prompt)}`;
      const response = await axios.get(apiUrl);
      const data = response.data;

      const reply = data?.answer || null;

      if (!data?.success || !reply) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return message.reply("❌ Received an unexpected response from ChatGPT. Please try again.");
      }

      api.setMessageReaction("✅", event.messageID, () => {}, true);
      message.reply(reply);

    } catch (error) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      console.error(error.response?.data || error.message);
      message.reply("❌ An error occurred while contacting ChatGPT. Please try again.");
    }
  }
};
