const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

const token = "8299910513:AAEY1puiQL-Ref3QntwzuDcduchMMKIHoWg";
const bot = new TelegramBot(token, { polling: true });
const GROUP_ID = -1003087001212;
const userState = {};
const USERS_FILE = path.join(__dirname, "users.json");

// Users.json faylini yaratish yoki o'qish
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    // Fayl mavjud bo'lmasa bo'sh array qaytarish
    return [];
  }
}

// Users.json ga saqlash
async function saveUsers(users) {
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    console.log("Users.json muvaffaqqiyatli yangilandi");
  } catch (error) {
    console.error("Users.json ni saqlashda xatolik:", error);
  }
}

// Userlarni solishtirish va o'chirish funksiyasi
async function checkAndRemoveUsers() {
  try {
    console.log("Userlarni tekshirish boshlandi...");
    
    // API dan ma'lumotlarni olish
    const apiResponse = await axios.get("https://group-backend-n1kr.onrender.com/api/users");
    const apiUsers = apiResponse.data;
    
    // JSON fayldan ma'lumotlarni o'qish
    const localUsers = await loadUsers();
    
    // API dagi telegram_id larni to'plash
    const apiTelegramIds = new Set(apiUsers.map(user => user.telegram_id.toString()));
    
    // O'chirilgan userlarni topish
    const usersToRemove = localUsers.filter(localUser => 
      !apiTelegramIds.has(localUser.telegram_id.toString())
    );
    
    // O'chirilgan userlarni guruhdan chiqarish va JSON dan o'chirish
    for (const user of usersToRemove) {
      try {
        // Guruhdan chiqarish
        await bot.banChatMember(GROUP_ID, user.telegram_id);
        console.log(`User ${user.full_name} (${user.telegram_id}) guruhdan chiqarildi`);
        
        // Userga xabar yuborish
        await bot.sendMessage(
          user.telegram_id,
          "❌ <b>Diqqat!</b>\n\nSiz ayrim sabablarga ko'ra guruhdan chetlatildingiz.",
          { parse_mode: "HTML" }
        );
        
      } catch (error) {
        console.error(`User ${user.telegram_id} ni guruhdan chiqarishda xatolik:`, error.message);
      }
    }
    
    // JSON fayldan o'chirilgan userlarni olib tashlash
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

// /start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Foydalanuvchi";
  
  userState[chatId] = "WAITING_FOR_FULLNAME";
  
  const message = `<b>Asalom alaykum! 👋</b>

📝 Iltimos, to'liq FIOyingizni namunadagidek kiriting.

<b>Namuna:</b>
• Aliyev Alisher Nuraliyevich
• Aliyev Alisher Alisher og'li`;

  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

// F.I.O qabul qilish
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  
  // Agar user start bosib bo'lmagan bo'lsa yoki allaqachon ism bergan bo'lsa chiqib ketamiz
  if (!userState[chatId] || userState[chatId] !== "WAITING_FOR_FULLNAME") return;
  
  const fullName = msg.text.trim();
  
  // Eng oddiy validatsiya — kamida 3 ta so'z bo'lishi kerak
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
    
    // Ma'lumotni serverga POST qilish
    try {
      await axios.post("https://group-backend-n1kr.onrender.com/api/users", userData);
      console.log("✅ User serverga muvaffaqqiyatli yuborildi");
    } catch (apiError) {
      console.error("❌ Serverga yuborishda xatolik:", apiError.message);
      // API xatosi bo'lsa ham davom etamiz
    }
    
    // JSON faylga ham saqlash
    try {
      const users = await loadUsers();
      
      // Agar user allaqachon mavjud bo'lmasa qo'shish
      const existingUserIndex = users.findIndex(u => u.telegram_id === userData.telegram_id);
      if (existingUserIndex === -1) {
        users.push(userData);
        await saveUsers(users);
        console.log("✅ User users.json ga saqlandi");
      } else {
        // Mavjud userni yangilash
        users[existingUserIndex] = userData;
        await saveUsers(users);
        console.log("✅ User users.json da yangilandi");
      }
    } catch (fileError) {
      console.error("❌ JSON faylga saqlashda xatolik:", fileError.message);
    }
    
    console.log("Link yaratish boshlandi...");
    
    // 1 marttalik link yaratish
    try {
      const link = await bot.createChatInviteLink(GROUP_ID, {
        member_limit: 1,
      });
      
      console.log("✅ Link muvaffaqqiyatli yaratildi:", link.invite_link);
      
      await bot.sendMessage(
        chatId,
        `✅ <b>Rahmat!</b> Ro'yxatdan o'tish muvaffaqqiyatli yakunlandi!

🔗 Mana sizning 1 martalik guruh linkingiz:
${link.invite_link}

ℹ️ Ushbu linkdan <b>faqat 1 marta</b> foydalanish mumkin.`,
        { parse_mode: "HTML" }
      );
      
      console.log("✅ Xabar userga yuborildi");
      
    } catch (linkError) {
      console.error("❌ Link yaratishda xatolik:", linkError.message);
      
      // Link yaratishda xatolik bo'lsa oddiy xabar yuboramiz
      await bot.sendMessage(
        chatId,
        "✅ <b>Rahmat!</b> Ro'yxatdan o'tish muvaffaqqiyatli yakunlandi!\n\n❌ Afsuski, guruh linkini yaratishda xatolik yuz berdi. Administrator bilan bog'laning.",
        { parse_mode: "HTML" }
      );
    }
    
    // State ni tozalash
    delete userState[chatId];
    console.log("✅ Jarayon tugallandi");
    
  } catch (err) {
    console.error("❌ Umumiy xatolik:", err.message);
    console.error("Stack trace:", err.stack);
    bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
});

// 2 daqiqada bir userlarni tekshirish
setInterval(checkAndRemoveUsers, 2 * 60 * 1000); // 2 daqiqa = 120,000 ms

console.log("Bot ishga tushdi...");
console.log("User tekshirish tizimi faol (har 2 daqiqada)...");