const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

// 🔑 ENV (Render sẽ set)
const BOT_TOKEN = process.env.BOT_TOKEN;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const URL = process.env.RENDER_EXTERNAL_URL;

// 📦 tạo bot (KHÔNG polling)
const bot = new TelegramBot(BOT_TOKEN);

// 📂 file lưu dữ liệu
const DB_FILE = "posts.json";

// 👉 load dữ liệu
let posts = [];
if (fs.existsSync(DB_FILE)) {
  posts = JSON.parse(fs.readFileSync(DB_FILE));
}

// 👉 lưu file
function savePosts() {
  fs.writeFileSync(DB_FILE, JSON.stringify(posts, null, 2));
}

// 📌 đăng bài text
async function postText(message) {
  const res = await axios.post("https://graph.facebook.com/v18.0/me/feed", {
    message,
    access_token: PAGE_TOKEN,
  });
  return res.data.id;
}

// 🔍 tìm bài
function findPost(keyword) {
  return posts.find((p) =>
    p.content.toLowerCase().includes(keyword.toLowerCase()),
  );
}

// 📡 webhook Telegram
bot.setWebHook(`${URL}/bot`);

app.post("/bot", async (req, res) => {
  const msg = req.body.message;
  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text;

  try {
    // 🔹 LỆNH SHARE
    if (text && text.toLowerCase().startsWith("share ")) {
      const keyword = text.replace("share ", "");

      const post = findPost(keyword);

      if (!post) {
        await bot.sendMessage(chatId, "❌ Không tìm thấy bài!");
        return res.sendStatus(200);
      }

      const postUrl = `https://www.facebook.com/${post.id}`;
      const shareLink = `https://www.facebook.com/sharer/sharer.php?u=${postUrl}`;

      await bot.sendMessage(
        chatId,
        `🔎 Tìm thấy bài:\n${post.content}\n\n👉 Share:\n${shareLink}`,
      );

      return res.sendStatus(200);
    }

    // 🔹 ĐĂNG BÀI MỚI
    if (text) {
      const postId = await postText(text);

      posts.push({
        id: postId,
        content: text,
        createdAt: new Date(),
      });

      savePosts();

      const postUrl = `https://www.facebook.com/${postId}`;
      const shareLink = `https://www.facebook.com/sharer/sharer.php?u=${postUrl}`;

      await bot.sendMessage(
        chatId,
        `✅ Đã đăng bài!\n\n👉 Link:\n${postUrl}\n\n🔥 Share nhanh:\n${shareLink}`,
      );
    }
  } catch (err) {
    console.error(err.response?.data || err.message);
    await bot.sendMessage(chatId, "❌ Lỗi đăng bài!");
  }

  res.sendStatus(200);
});

// 🌐 chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
