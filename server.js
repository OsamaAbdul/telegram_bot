import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
 import dotenv from 'dotenv';
 dotenv.config();

//SETTING EXPRESS TO AN APP


const app = express();

// SETTING UP THE TELEGRAM token and bot

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true});


// setting the bot to listen to event when its been trigger

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText === '/start') {
    bot.sendMessage(chatId, 'Welcome to the bot!');
  }
});



app.get("/", (req, res) => {
    res.send("Welcome to my telegram bot...")
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, (req, res) => {
    console.log(`App listening at port:${PORT}`);
})