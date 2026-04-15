const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

// 🔑 Cấu hình biến môi trường (Environment Variables)
const BOT_TOKEN = process.env.BOT_TOKEN;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const URL = process.env.RENDER_EXTERNAL_URL;
const PAGE_ID = process.env.PAGE_ID; // Tùy chọn: Dùng để tạo link chuẩn hơn

const bot = new TelegramBot(BOT_TOKEN);
const DB_FILE = "posts.json";

// 📂 Quản lý dữ liệu file (Lưu ý: Render Free sẽ xóa file khi restart)
let posts = [];
if (fs.existsSync(DB_FILE)) {
  try {
    posts = JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    posts = [];
  }
}

function savePosts() {
  fs.writeFileSync(DB_FILE, JSON.stringify(posts, null, 2));
}

// 📌 Hàm đăng bài lên Facebook (Tự động nhận diện Text hoặc Photo)
async function postToFacebook(content, photoUrl = null) {
  let endpoint, data;

  if (photoUrl) {
    // Đăng ảnh
    endpoint = `https://graph.facebook.com/v18.0/me/photos`;
    data = {
      url: photoUrl,
      caption: content,
      access_token: PAGE_TOKEN,
    };
  } else {
    // Đăng text
    endpoint = `https://graph.facebook.com/v18.0/me/feed`;
    data = {
      message: content,
      access_token: PAGE_TOKEN,
    };
  }

  const res = await axios.post(endpoint, data);
  return res.data.id || res.data.post_id;
}

// 🔍 Hàm tìm kiếm bài viết cũ
function findPost(keyword) {
  return posts.find((p) =>
    p.content.toLowerCase().includes(keyword.toLowerCase())
  );
}

// 📡 Thiết lập Webhook
bot.setWebHook(`${URL}/bot`);

app.post("/bot", async (req, res) => {
  const msg = req.body.message;
  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text || msg.caption || ""; // Lấy text hoặc chú thích ảnh

  try {
    // 🔹 XỬ LÝ LỆNH TÌM KIẾM & SHARE
    if (text.toLowerCase().startsWith("share ")) {
      const keyword = text.replace("share ", "").trim();
      const post = findPost(keyword);

      if (!post) {
        await bot.sendMessage(chatId, "❌ Không tìm thấy bài viết nào khớp với từ khóa!");
      } else {
        const postUrl = `https://www.facebook.com/${post.id}`;
        const shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
        await bot.sendMessage(
          chatId,
          `🔎 Tìm thấy bài:\n"${post.content}"\n\n👉 Link: ${postUrl}\n🔥 Share: ${shareLink}`
        );
      }
      return res.sendStatus(200);
    }

    // 🔹 XỬ LÝ ĐĂNG BÀI
    let postId;
    
    if (msg.photo) {
      // Nếu là ảnh: Lấy ảnh chất lượng cao nhất
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const photoLink = await bot.getFileLink(fileId);
      postId = await postToFacebook(text, photoLink);
    } else if (text) {
      // Nếu là text thuần túy
      postId = await postToFacebook(text);
    }

    if (postId) {
      posts.push({
        id: postId,
        content: text || "Hình ảnh",
        createdAt: new Date(),
      });
      savePosts();

      const postUrl = `https://www.facebook.com/${postId}`;
      const shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;

      await bot.sendMessage(
        chatId,
        `✅ Đã đăng lên Facebook!\n\n🔗 Link bài: ${postUrl}\n\n📢 Share nhanh: ${shareLink}`
      );
    }
  } catch (err) {
    console.error("Lỗi API:", err.response?.data || err.message);
    const errorMsg = err.response?.data?.error?.message || "Không thể kết nối với Facebook.";
    await bot.sendMessage(chatId, `❌ Lỗi: ${errorMsg}`);
  }

  res.sendStatus(200);
});

// 🌐 Khởi chạy Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server is running on port " + PORT);
});
