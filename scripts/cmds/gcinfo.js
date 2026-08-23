module.exports = {
  config: {
    name: "gcinfo",
    version: "2.0",
    author: "OPU SENSEI",
    role: 0,
    shortDescription: "Stylish group info with custom theme",
    category: "box chat",
    guide: "{pn}"
  },

  onStart: async function ({ api, event, usersData }) {
    const threadID = event.threadID;

    if (!event.isGroup)
      return api.sendMessage("❌ | This command works only in groups.", threadID);

    try {
      const info = await api.getThreadInfo(threadID);

      const groupName = info.threadName || "Unnamed Group";
      const members = info.participantIDs.length;
      const admins = info.adminIDs.length;
      const emoji = info.emoji || "🌐";
      const approval = info.approvalMode ? "Enabled ✅" : "Disabled ❌";

      let male = 0, female = 0, unknown = 0;

      for (const uid of info.participantIDs) {
        try {
          const data = await usersData.get(uid);
          const gender = data?.gender;

          if (gender == 2 || gender == "MALE") male++;
          else if (gender == 1 || gender == "FEMALE") female++;
          else unknown++;
        } catch {
          unknown++;
        }
      }

      // ✅ Admin Names
      let adminNames = [];
      for (const admin of info.adminIDs) {
        try {
          const name = await usersData.getName(admin.id);
          adminNames.push(`⚜️ ${name}`);
        } catch {
          adminNames.push("⚜️ Unknown Admin");
        }
      }

      // ✅ Group Picture
      let attachment = null;
      try {
        const picURL = `https://graph.facebook.com/${threadID}/picture?width=512&height=512`;
        attachment = await global.utils.getStreamFromURL(picURL);
      } catch {}

      const msg =
`╔═══════════════════════╗
   ✨ 𝐆𝐑𝐎𝐔𝐏 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍 ✨
╚═══════════════════════╝

📌 𝐍𝐚𝐦𝐞 : ${groupName}
🎭 𝐄𝐦𝐨𝐣𝐢 : ${emoji}
🔒 𝐀𝐩𝐩𝐫𝐨𝐯𝐚𝐥 : ${approval}

───────────────
📊 𝐒𝐓𝐀𝐓𝐈𝐒𝐓𝐈𝐂𝐒
───────────────
👥 𝐓𝐨𝐭𝐚𝐥 𝐌𝐞𝐦𝐛𝐞𝐫𝐬 : ${members}
🛡️ 𝐓𝐨𝐭𝐚𝐥 𝐀𝐝𝐦𝐢𝐧𝐬  : ${admins}

🚹 𝐌𝐚𝐥𝐞    : ${male}
🚺 𝐅𝐞𝐦𝐚𝐥𝐞  : ${female}
❓ 𝐔𝐧𝐤𝐧𝐨𝐰𝐧 : ${unknown}

───────────────
👑 𝐀𝐃𝐌𝐈𝐍 𝐋𝐈𝐒𝐓
───────────────
${adminNames.map(n => `  ${n}`).join("\n")}

═══════════════════════
💫 𝐑𝐞𝐪𝐮𝐞𝐬𝐭𝐞𝐝 𝐁𝐲 : 𝐆𝐫𝐨𝐮𝐩 𝐌𝐞𝐦𝐛𝐞𝐫`;

      api.sendMessage(
        attachment ? { body: msg, attachment } : msg,
        threadID
      );

    } catch (err) {
      console.error("GCINFO ERROR:", err);
      api.sendMessage("❌ | Failed to fetch group info.", threadID);
    }
  }
};
