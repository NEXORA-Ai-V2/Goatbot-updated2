const axios = require("axios");

module.exports = {
  config: {
    name: "welcome",
    version: "1.0",
    author: "Opu Sensei",
    description: {
      en: "Automatically sends a welcome image when new members join the group",
    },
    category: "box chat",
  },

  onStart: async function ({ api, event, usersData, threadsData }) {
    if (event.logMessageType === "log:subscribe") {
      const { threadID } = event;
      const { addedParticipants } = event.logMessageData;

      // Check if the bot itself was added to the group
      const botID = api.getCurrentUserID();
      if (addedParticipants.some((item) => item.userFbId === botID)) {
        return api.sendMessage(
          "Thank you for adding me to your group!",
          threadID
        );
      }

      try {
        const threadInfo = await threadsData.get(threadID);
        const groupName = threadInfo.threadName || "our group";

        for (const participant of addedParticipants) {
          const userID = participant.userFbId;
          const userName = participant.fullName || (await usersData.getName(userID));
          const avatarUrl = `https://graph.facebook.com/${userID}/picture?height=500&width=500&access_token=6628568379%7Cc1541d2d57d0d5e44e22ac78412153c9`;

          const apiUrl = `https://toshiro-api-editz6t9.vercel.app/api/canvas/welcome?username=${encodeURIComponent(
            userName
          )}&avatar_url=${encodeURIComponent(
            avatarUrl
          )}&title=${encodeURIComponent("WELCOME")}&subtitle=${encodeURIComponent(
            groupName
          )}`;

          const stream = await global.utils.getStreamFromURL(apiUrl);

          await api.sendMessage(
            {
              body: `Welcome ${userName} to ${groupName}! Enjoy your stay here.`,
              attachment: stream,
            },
            threadID
          );
        }
      } catch (error) {
        console.error(`Welcome Event Error: ${error.message}`);
      }
    }
  },
};
