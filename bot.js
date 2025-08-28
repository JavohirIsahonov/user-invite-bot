const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const GROUP_ID = -1003086206324; // Supergroup ID
const userState = {};
const USERS_FILE = path.join(__dirname, "users.json");

async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveUsers(users) {
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    console.log("Users.json muvaffaqqiyatli yangilandi");
  } catch (error) {
    console.error("Users.json ni saqlashda xatolik:", error);
  }
}

async function checkAndRemoveUsers() {
  try {
    console.log("Userlarni tekshirish boshlandi...");
    
    const apiResponse = await axios.get("https://group-backend-01z3.onrender.com/api/users");
    const apiUsers = apiResponse.data;
    
    const localUsers = await loadUsers();
    const apiTelegramIds = new Set(apiUsers.map(user => user.telegram_id.toString()));
    
    const usersToRemove = localUsers.filter(localUser => 
      !apiTelegramIds.has(localUser.telegram_id.toString())
    );
    
    for (const user of usersToRemove) {
      try {
        // Userni ban qilish
        await bot.banChatMember(GROUP_ID, user.telegram_id);
        // Keyin darhol unban qilish
        await bot.unbanChatMember(GROUP_ID, user.telegram_id);

        console.log(`User ${user.full_name} (${user.telegram_id}) guruhdan chiqarildi (ban+unban).`);
      } catch (error) {
        console.error(`User ${user.telegram_id} ni chiqarishda xatolik:`, error.message);
      }
    }
    
    if (usersToRemove.length > 0) {
      const updatedUsers = localUsers.filter(localUser => 
        apiTelegramIds.has(localUser.telegram_id.toString())
      );
      await saveUsers(updatedUsers);
      console.log(`${usersToRemove.length} ta user JSON fayldan o'chirildi`);
    } else {
      console.log("O'chiriladigan userlar topilmadi");
    }
    
  } catch (error) {
    console.error("Userlarni tekshirishda xatolik:", error.message);
  }
}

// /unban komandasi
bot.onText(/\/unban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  // faqat guruh ichida ishlasin
  if (msg.chat.type !== "supergroup" && msg.chat.type !== "group") {
    return bot.sendMessage(chatId, "❌ Bu komanda faqat guruh ichida ishlaydi.");
  }

  // adminmi tekshirish
  try {
    const member = await bot.getChatMember(GROUP_ID, fromId);
    if (member.status !== "administrator" && member.status !== "creator") {
      return bot.sendMessage(chatId, "❌ Sizda bu komandani ishlatish huquqi yo‘q.");
    }
  } catch (err) {
    return bot.sendMessage(chatId, "❌ Adminlikni tekshirishda xatolik.");
  }

  const userId = match[1].trim();

  try {
    await bot.unbanChatMember(GROUP_ID, userId);
    bot.sendMessage(chatId, `✅ User <code>${userId}</code> unban qilindi.`, { parse_mode: "HTML" });
    console.log(`User ${userId} guruhdan unban qilindi`);
  } catch (error) {
    console.error("Unban xatolik:", error.message);
    bot.sendMessage(chatId, `❌ User <code>${userId}</code> ni unban qilishda xatolik: ${error.message}`, { parse_mode: "HTML" });
  }
});

// /start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  userState[chatId] = "WAITING_FOR_FULLNAME";
  
  const message = `<b>Asalom alaykum! 👋</b>

📝 Iltimos, to'liq FIOyingizni namunadagidek kiriting.

<b>Namuna:</b>
• Aliyev Alisher Alisherivich
• Aliyev Alisher Alisher og'li`;

  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  
  if (!userState[chatId] || userState[chatId] !== "WAITING_FOR_FULLNAME") return;
  
  const fullName = msg.text.trim();
  
  if (fullName.split(" ").length < 3) {
    return bot.sendMessage(
      chatId,
      "⚠️ Iltimos, F.I.O ni to'liq kiriting!\n\n<b>Masalan:</b> <code>Aliyev Alisher Nuraliyevich</code>",
      { parse_mode: "HTML" }
    );
  }
  
  try {
    console.log(`${fullName} uchun ro'yxatdan o'tish boshlandi...`);
    
    const userData = {
      telegram_id: msg.from.id,
      full_name: fullName,
      nickname: msg.from.username || null,
      registered_at: new Date().toISOString()
    };
    
    try {
      await axios.post("https://group-backend-01z3.onrender.com/api/users", userData);
      console.log("✅ User serverga muvaffaqqiyatli yuborildi");
    } catch (apiError) {
      console.error("❌ Serverga yuborishda xatolik:", apiError.message);
    }
    
    try {
      const users = await loadUsers();
      
      const existingUserIndex = users.findIndex(u => u.telegram_id === userData.telegram_id);
      if (existingUserIndex === -1) {
        users.push(userData);
        await saveUsers(users);
        console.log("✅ User users.json ga saqlandi");
      } else {
        users[existingUserIndex] = userData;
        await saveUsers(users);
        console.log("✅ User users.json da yangilandi");
      }
    } catch (fileError) {
      console.error("❌ JSON faylga saqlashda xatolik:", fileError.message);
    }
    
    await bot.sendMessage(
      chatId,
      `✅ <b>Rahmat!</b> Ro'yxatdan o'tish muvaffaqqiyatli yakunlandi!

📩 So'rovingiz qabul qilindi. 
👨‍💻 Adminlarimiz ruxsat berganidan so'ng guruhga qo'shilish havolasini olasiz.`,
      { parse_mode: "HTML" }
    );

    console.log("✅ Xabar userga yuborildi");
    
    delete userState[chatId];
    console.log("✅ Jarayon tugallandi");
    
  } catch (err) {
    console.error("❌ Umumiy xatolik:", err.message);
    console.error("Stack trace:", err.stack);
    bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
});

setInterval(checkAndRemoveUsers, 2 * 60 * 1000);

console.log("Bot ishga tushdi...");
console.log("User tekshirish tizimi faol (har 2 daqiqada)...");