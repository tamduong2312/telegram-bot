const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const URL = process.env.RENDER_EXTERNAL_URL;

const bot = new TelegramBot(BOT_TOKEN);

// 🛒 Bộ nhớ tạm để gom album ảnh
const mediaGroups = new Map();

// 📌 Hàm đăng Album ảnh lên Facebook
async function postAlbum(photos, caption) {
  // Bước 1: Upload từng ảnh lên FB ở chế độ "không hiển thị" (published: false)
  const uploadedIds = await Promise.all(
    photos.map(async (url) => {
      const res = await axios.post(`https://graph.facebook.com/v18.0/me/photos`, {
        url: url,
        published: false,
        access_token: PAGE_TOKEN,
      });
      return { media_fbid: res.data.id };
    })
  );

  // Bước 2: Gom các ID ảnh lại thành một bài đăng (Feed)
  const res = await axios.post(`https://graph.facebook.com/v18.0/me/feed`, {
    message: caption,
    attached_media: uploadedIds,
    access_token: PAGE_TOKEN,
  });
  
  return res.data.id;
}

// 📌 Hàm đăng 1 bài đơn (Text hoặc 1 Ảnh) - Giữ lại từ bản trước
async function postSingle(content, photoUrl = null) {
  let endpoint = photoUrl ? `https://graph.facebook.com/v18.0/me/photos` : `https://graph.facebook.com/v18.0/me/feed`;
  let data = photoUrl 
    ? { url: photoUrl, caption: content, access_token: PAGE_TOKEN }
    : { message: content, access_token: PAGE_TOKEN };

  const res = await axios.post(endpoint, data);
  return res.data.id;
}

bot.setWebHook(`${URL}/bot`);

app.post("/bot", async (req, res) => {
  const msg = req.body.message;
  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text || msg.caption || "";
  const mediaGroupId = msg.media_group_id;

  try {
    // 1. XỬ LÝ ĐĂNG NHIỀU ẢNH (ALBUM)
    if (mediaGroupId) {
      if (!mediaGroups.has(mediaGroupId)) {
        mediaGroups.set(mediaGroupId, {
          photos: [],
          caption: text,
          timer: null
        });
      }

      const group = mediaGroups.get(mediaGroupId);
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const photoLink = await bot.getFileLink(fileId);
      group.photos.push(photoLink);
      if (text) group.caption = text; // Lấy caption từ ảnh có chứa text

      // Xóa timer cũ, tạo timer mới (đợi 3 giây để gom đủ ảnh)
      clearTimeout(group.timer);
      group.timer = setTimeout(async () => {
        const finalGroup = mediaGroups.get(mediaGroupId);
        mediaGroups.delete(mediaGroupId); // Xóa khỏi bộ nhớ sau khi xử lý

        try {
          const postId = await postAlbum(finalGroup.photos, finalGroup.caption);
          await bot.sendMessage(chatId, `✅ Đã đăng Album (${finalGroup.photos.length} ảnh)!\n🔗 Link: https://www.facebook.com/${postId}`);
        } catch (e) {
          console.error(e.response?.data || e.message);
          await bot.sendMessage(chatId, "❌ Lỗi khi đăng album!");
        }
      }, 3000);

      return res.sendStatus(200);
    }

    // 2. XỬ LÝ ĐĂNG 1 ẢNH ĐƠN HOẶC TEXT
    if (msg.photo || (text && !text.toLowerCase().startsWith("share "))) {
      let postId;
      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const photoLink = await bot.getFileLink(fileId);
        postId = await postSingle(text, photoLink);
      } else {
        postId = await postSingle(text);
      }
      
      if (postId) {
        await bot.sendMessage(chatId, `✅ Đã đăng thành công!\n🔗 Link: https://www.facebook.com/${postId}`);
      }
    }

  } catch (err) {
    console.error(err.response?.data || err.message);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
