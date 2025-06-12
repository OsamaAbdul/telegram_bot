import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import cron from 'node-cron';

dotenv.config();

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const mongoUri = process.env.MONGO_URI;
const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || [];

const BTC_WALLET = process.env.YOUR_BTC_WALLET_ADDRESS
const ETH_WALLET = process.env.YOUR_ETH_WALLET_ADDRESS
const USDT_WALLET = process.env.YOUR_USDT_WALLET_ADDRESS


if (!token || !mongoUri) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
let client;
let db;

MongoClient.connect(mongoUri)
  .then((connectedClient) => {
    console.log('Connected to MongoDB');
    client = connectedClient;
    db = client.db('escrow_bot');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function getOrCreateUser(chatId) {
  if (!db) throw new Error('Database not connected');
  const usersCollection = db.collection('users');
  let user = await usersCollection.findOne({ chatId });

  if (!user) {
    user = { chatId, balance: 0 };
    await usersCollection.insertOne(user);
  }

  return user;
}

async function simulateTyping(chatId, callback) {
  await bot.sendChatAction(chatId, 'typing');
  setTimeout(callback, 1000);
}

function getMainKeyboard(chatId) {
  const baseKeyboard = [
    [
      { text: 'Deposit 💳', callback_data: 'deposit' },
      { text: 'Check Balance 💰', callback_data: 'balance' },
    ],
    [
      { text: 'Policy 📚', callback_data: 'policy' },
      { text: 'Main Menu 🏠', callback_data: 'main_menu' },
    ],
    [
      { text: 'Release Funds ✔️', callback_data: 'release' },
      { text: 'Request Refund ↩️', callback_data: 'refund' },
      { text: 'Contact Support ☎️', callback_data: 'contact_us' },
    ],
  ];

  if (adminIds.includes(chatId)) {
    baseKeyboard.push([
      { text: 'Admin Panel ⚙️', callback_data: 'admin_panel' }
    ]);
  }

  return { inline_keyboard: baseKeyboard };
}

const balanceKeyboard = {
  inline_keyboard: [
    [
      { text: 'Need Help? Contact Support ☎️', callback_data: 'payment_support' },
      { text: 'Make a Deposit 💰', callback_data: 'deposit' },
    ],
  ],
};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text.toLowerCase();

  if (messageText === '/start') {
    const welcomeMessage = `🤖 *Welcome to SafePay Escrow Bot!*

Escrow ensures both parties are protected during transactions.

*Fee:* 6% for buyers

To get started:
1. Make a deposit
2. View your balance
3. Read our policy before any action

Use the buttons below to navigate.`;
    bot.sendMessage(chatId, welcomeMessage, { reply_markup: getMainKeyboard(chatId), parse_mode: 'Markdown' });
  } else if (messageText === '/balance') {
    try {
      const user = await getOrCreateUser(chatId);
      bot.sendMessage(chatId, `💰 Your current balance is *$${user.balance.toFixed(2)}*`, { reply_markup: balanceKeyboard, parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error fetching balance:', err);
      bot.sendMessage(chatId, '❌ Error fetching balance. Please try again later.');
    }
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  switch (data) {
    case 'balance':
      await simulateTyping(chatId, async () => {
        try {
          const user = await getOrCreateUser(chatId);
          await bot.sendMessage(chatId, `💰 Your current balance is *$${user.balance.toFixed(2)}*`, { reply_markup: balanceKeyboard, parse_mode: 'Markdown' });
        } catch (err) {
          console.error('Error fetching balance:', err);
          await bot.sendMessage(chatId, '❌ Error fetching balance. Please try again later.');
        }
      });
      break;

    case 'deposit':
      await simulateTyping(chatId, () => {
        const depositMsg = `🔐 *How to Deposit*

            Send funds to one of the following wallets. Include 6% escrow fee:

            *BTC:* \n\`${BTC_WALLET}\`
            *ETH:*\n \`${ETH_WALLET}\`
            *USDT (TRC20):* \n\`${USDT_WALLET}\`

            ⚠️ Ensure correct wallet address before transferring.`;
        bot.sendMessage(chatId, depositMsg, { parse_mode: 'Markdown' });
      });
      break;

    case 'policy':
      await simulateTyping(chatId, () => {
        const policy = `📜 *Escrow Policy Summary*

✔️ Buyer fee: *6%* | Seller fee: *10%*
✔️ Always confirm service/product is received as promised before releasing funds
✔️ Provide clear proof (screenshots/videos) in case of disputes
✔️ Avoid KYC wallets (e.g., Coinbase)
✔️ We *cannot* reverse transactions after fund release

Use trusted wallets & follow best practices.`;
        bot.sendMessage(chatId, policy, { parse_mode: 'Markdown' });
      });
      break;

    case 'main_menu':
      await simulateTyping(chatId, () => {
        bot.sendMessage(chatId, '🏠 Main Menu', { reply_markup: getMainKeyboard(chatId) });
      });
      break;

    case 'payment_support':
    case 'contact_us':
      await simulateTyping(chatId, () => {
        bot.sendMessage(chatId, `☎️ *Support Contact*

If you need help, please message us via our official support handle.

Telegram: @OfficialEscrowSupport

Only use the button below for verified communication.

_We reply within 24 hours._`, { parse_mode: 'Markdown' });
      });
      break;

    case 'release':
      await simulateTyping(chatId, () => {
        bot.sendMessage(chatId, `✅ Please paste the *recipient wallet address* to release funds.

Only confirm if you are 100% satisfied with the transaction.`, { parse_mode: 'Markdown' });
      });
      break;

    case 'refund':
      await simulateTyping(chatId, () => {
        const refundMsg = `↩️ *Refund Request*

Paste your wallet address , and send evidence @support that shows you didn't get what you paid for or service not working as requested. refund will be deposited immediately after review.

©️Coins Escrow Bot

Release Funds 💰`;
        bot.sendMessage(chatId, refundMsg, { parse_mode: 'Markdown' });
      });
      break;

    case 'admin_panel':
      if (!adminIds.includes(chatId)) {
        return bot.sendMessage(chatId, '⛔️ You are not authorized to access the admin panel.');
      }

      await simulateTyping(chatId, async () => {
        const adminKeyboard = {
          inline_keyboard: [
            [
              { text: 'Approve Deposit ✅', callback_data: 'approve_deposit' },
              { text: 'Review Refunds 🔍', callback_data: 'review_refunds' },
            ],
            [
              { text: 'Adjust Balance ✏️', callback_data: 'adjust_balance' },
            ],
          ],
        };
        bot.sendMessage(chatId, '⚙️ *Admin Panel*', { parse_mode: 'Markdown', reply_markup: adminKeyboard });
      });
      break;

    case 'approve_deposit':
      bot.sendMessage(chatId, '👤 Enter the user\'s chat ID to approve deposit:');
      bot.once('message', (msg1) => {
        const targetId = parseInt(msg1.text.trim());
        bot.sendMessage(chatId, '💵 Enter deposit amount to credit:');
        bot.once('message', async (msg2) => {
          const amount = parseFloat(msg2.text.trim());
          if (!isNaN(targetId) && !isNaN(amount)) {
            const users = db.collection('users');
            await users.updateOne({ chatId: targetId }, { $inc: { balance: amount } }, { upsert: true });
            bot.sendMessage(chatId, `✅ Credited $${amount.toFixed(2)} to user ${targetId}`);
            bot.sendMessage(targetId, `💳 Your account has been credited with $${amount.toFixed(2)} by admin.`);
          } else {
            bot.sendMessage(chatId, '❌ Invalid input. Operation cancelled.');
          }
        });
      });
      break;

    case 'adjust_balance':
      bot.sendMessage(chatId, '👤 Enter the user\'s chat ID to adjust balance:');
      bot.once('message', (msg1) => {
        const targetId = parseInt(msg1.text.trim());
        bot.sendMessage(chatId, '➕➖ Type `add` or `subtract`:');
        bot.once('message', (msg2) => {
          const operation = msg2.text.trim().toLowerCase();
          if (!['add', 'subtract'].includes(operation)) {
            return bot.sendMessage(chatId, '❌ Invalid operation. Type "add" or "subtract".');
          }
          bot.sendMessage(chatId, '💵 Enter amount:');
          bot.once('message', async (msg3) => {
            const amount = parseFloat(msg3.text.trim());
            const change = operation === 'add' ? amount : -amount;
            if (!isNaN(amount)) {
              await db.collection('users').updateOne({ chatId: targetId }, { $inc: { balance: change } }, { upsert: true });
              bot.sendMessage(chatId, `✅ Updated balance: ${operation === 'add' ? '+' : '-'}$${amount.toFixed(2)} for user ${targetId}`);
              bot.sendMessage(targetId, `💼 Your balance has been ${operation === 'add' ? 'increased' : 'decreased'} by $${amount.toFixed(2)} by admin.`);
            } else {
              bot.sendMessage(chatId, '❌ Invalid amount.');
            }
          });
        });
      });
      break;

    case 'review_refunds':
      const refunds = await db.collection('refunds').find({ status: 'pending' }).toArray();
      if (refunds.length === 0) {
        bot.sendMessage(chatId, '✅ No pending refunds at the moment.');
      } else {
        let msg = '🔍 *Pending Refund Requests:*';
        refunds.forEach((refund, i) => {
          msg += `\n${i + 1}. User: ${refund.chatId}\nAmount: $${refund.amount.toFixed(2)}\nReason: ${refund.reason || 'N/A'}\n`;
        });
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
      break;
  }

  bot.answerCallbackQuery(query.id);
});

cron.schedule('0 9 * * *', async () => {
  if (!db) return;
  const users = await db.collection('users').find({}).toArray();
  users.forEach(user => {
    bot.sendMessage(user.chatId, '🗓️ Friendly reminder: Check your escrow balance and policy regularly to stay informed.');
  });
});

app.get('/', (req, res) => {
  res.send('✅ Escrow bot is running...');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`App listening at port: ${PORT}`);
});
