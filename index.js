const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// Store user data in memory (resets if server restarts)
let userId = null;
let logs = [];
let userProfile = {
  height: null,
  weight: null,
  targetWeight: null,
  targetDate: null
};

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message') return;

  // Save userId so we can send proactive messages later
  if (event.source && event.source.userId) {
    userId = event.source.userId;
    console.log('USER ID FOUND: ' + userId);
  }

  if (event.message.type === 'text') {
    const text = event.message.text;

    // Save the message as a log entry with timestamp
    logs.push({
      time: new Date().toISOString(),
      text: text
    });

    const reply = 'Got it! Recorded: ' + text;
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }
}

// View all logs (open this URL in browser to check records)
app.get('/logs', (req, res) => {
  res.json({ userId: userId, logs: logs });
});

// ===== Scheduled reminders =====
// Times are in Asia/Taipei timezone

function sendMessage(text) {
  if (!userId) {
    console.log('No userId saved yet, cannot send message');
    return;
  }
  client.pushMessage(userId, { type: 'text', text: text });
}

// 10:00 AM - breakfast check-in
cron.schedule('0 10 * * *', () => {
  sendMessage('早安！早餐吃了什麼呢？告訴我一下吧');
}, { timezone: 'Asia/Taipei' });

// 12:30 PM - lunch check-in
cron.schedule('30 12 * * *', () => {
  sendMessage('午餐時間！吃了什麼呢？');
}, { timezone: 'Asia/Taipei' });

// 7:00 PM - dinner check-in
cron.schedule('0 19 * * *', () => {
  sendMessage('晚餐吃了什麼呢？跟我說說吧');
}, { timezone: 'Asia/Taipei' });

// 12:00 AM - night reminder
cron.schedule('0 0 * * *', () => {
  sendMessage('該睡覺了！喝點溫水幫助入睡，記得輸入今天的體重數據哦');
}, { timezone: 'Asia/Taipei' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
