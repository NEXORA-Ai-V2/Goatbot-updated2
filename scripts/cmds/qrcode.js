const axios = require("axios");

module.exports = {
  config: {
    name: "qrcode",
    aliases: ["qr", "makeqr"],
    version: "1.0",
    author: "Opu Sensei",
    countDown: 3,
    role: 0,
    description: {
      en: "Generate a QR code from text or URL",
    },
    category: "utility",
    guide: {
      en: "{pn} <text or URL>",
    },
  },

  onStart: async function ({ api, args, event }) {
    let input = args.join(" ");

    if (!input && event.type === "message_reply") {
      input = event.messageReply.body;
    }

    if (!input) {
      return api.sendMessage(
        "❌ | Please provide text/URL or reply to a message.\n\nExample: !qrcode https://google.com",
        event.threadID,
        event.messageID
      );
    }

    try {
      const qrApiUrl = `https://toshiro-api-editz6t9.vercel.app/api/tools/qrcode?text=${encodeURIComponent(input)}`;
      const stream = await global.utils.getStreamFromURL(qrApiUrl);

      return api.sendMessage(
        {
          body: "✅ | Your QR Code has been generated successfully!",
          attachment: stream,
        },
        event.threadID,
        event.messageID
      );
    } catch (error) {
      console.error(`QR Code Error: ${error.message}`);
      return api.sendMessage(
        `❌ | Failed to generate QR Code: ${error.message}`,
        event.threadID,
        event.messageID
      );
    }
  },
};
