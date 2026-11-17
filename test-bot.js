const fs = require("fs");
const path = require("path");

// Load .env
const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Remove trailing comments if any
      const hashIdx = val.indexOf("#");
      if (hashIdx !== -1) val = val.slice(0, hashIdx).trim();
      process.env[key] = val;
    }
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

async function run() {
  console.log("🔍 Checking Telegram Bot Token...");
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = await meRes.json();

  if (!me.ok) {
    console.error("❌ Bot token check failed:", me);
    return;
  }

  console.log("✅ Bot connected successfully!");
  console.log(`   Name: ${me.result.first_name}`);
  console.log(`   Username: @${me.result.username}`);
  console.log(`   Link: https://t.me/${me.result.username}`);

  const targetChatId = process.argv[2];

  if (targetChatId) {
    console.log(`\n📤 Sending test message to chat ID: ${targetChatId}...`);
    const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: "🔔 *Price Tracker Test Alert*\nYour Telegram bot configuration is working perfectly!",
        parse_mode: "Markdown",
      }),
    });
    const sendData = await sendRes.json();
    if (sendData.ok) {
      console.log("✅ Test message delivered successfully!");
    } else {
      console.error("❌ Failed to send message:", sendData);
    }
    return;
  }

  console.log("\n📬 Checking for recent incoming messages (/getUpdates)...");
  const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const updates = await updatesRes.json();

  if (updates.ok && updates.result.length > 0) {
    console.log(`Found ${updates.result.length} update(s):`);
    for (const u of updates.result) {
      const msg = u.message;
      if (msg) {
        console.log(`   From: ${msg.from.first_name} (@${msg.from.username || "no_user"}) | Chat ID: ${msg.chat.id} | Text: "${msg.text || ""}"`);
      }
    }
    console.log(`\n💡 To send a test message to a chat ID, run:\n   node test-bot.js <chat_id>`);
  } else {
    console.log("No recent messages found.");
    console.log(`\n👉 Next step to test sending messages:`);
    console.log(`1. Open https://t.me/${me.result.username} in Telegram and click 'Start' (or send /start)`);
    console.log(`2. Run 'node test-bot.js' to see your Chat ID, or pass it directly: 'node test-bot.js <your_chat_id>'`);
  }
}

run().catch(console.error);
