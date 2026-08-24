const axios = require("axios");

module.exports = {
  config: {
    name: "wiki",
    aliases: ["wikipedia"],
    version: "1.0",
    author: "Opu Sensei",
    countDown: 3,
    role: 0,
    description: {
      en: "Search for information on Wikipedia",
    },
    category: "utility",
    guide: {
      en: "{pn} <query>",
    },
  },

  onStart: async function ({ api, args, event }) {
    let query = args.join(" ");

    if (!query && event.type === "message_reply") {
      query = event.messageReply.body;
    }

    if (!query) {
      return api.sendMessage(
        "❌ | Please provide a search topic or query.\n\nExample: !wiki Albert Einstein",
        event.threadID,
        event.messageID
      );
    }

    try {
      const res = await axios.get(
        `https://toshiro-api-editz6t9.vercel.app/api/search/wikipedia?search=${encodeURIComponent(query)}`
      );

      const data = res.data;
      const title = data.title || query;
      const description = data.description || data.extract || data.snippet || "No detailed information found.";
      const imageUrl = data.image || data.thumbnail;
      const wikiUrl = data.url || data.link;

      let message = `🌐 | Wikipedia Search: ${title}\n\n📝 Details:\n${description}`;
      if (wikiUrl) {
        message += `\n\n🔗 Read more: ${wikiUrl}`;
      }

      if (imageUrl) {
        try {
          const stream = await global.utils.getStreamFromURL(imageUrl);
          return api.sendMessage(
            {
              body: message,
              attachment: stream,
            },
            event.threadID,
            event.messageID
          );
        } catch (imgError) {
          return api.sendMessage(message, event.threadID, event.messageID);
        }
      }

      return api.sendMessage(message, event.threadID, event.messageID);
    } catch (error) {
      console.error(`Wikipedia Search Error: ${error.message}`);
      return api.sendMessage(
        `❌ | Could not find any results for "${query}".`,
        event.threadID,
        event.messageID
      );
    }
  },
};
