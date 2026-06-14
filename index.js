const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

let userId = null;
let logs = [];
let currentWeight = null;
let targetWeight = null;

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

  if (event.source && event.source.userId) {
    userId = event.source.userId;
  }

  if (event.message.type === 'text') {
    const text = event.message.text.trim();

    logs.push({
      time: new Date().toISOString(),
      text: text
    });

    // Check if message sets a target weight, format: "目標52" or "target52"
    const targetMatch = text.match(/^目標\s*(\d+(\.\d+)?)$/);
    if (targetMatch) {
      targetWeight = parseFloat(targetMatch[1]);
      const reply = '好的！目標體重已設定為 ' + targetWeight + ' kg';
      return client.replyMessage(event.replyToken, { type: 'text', text: reply });
    }

    // Check if message is just a number, treat as current weight
    const weightMatch = text.match(/^(\d+(\.\d+)?)$/);
    if (weightMatch) {
      currentWeight = parseFloat(weightMatch[1]);
      let reply = '已記錄今日體重：' + currentWeight + ' kg';
      if (targetWeight) {
        const diff = (currentWeight - targetWeight).toFixed(1);
        reply += '\n距離目標還有 ' + diff + ' kg';
      }
      return client.replyMessage(event.replyToken, { type: 'text', text: reply });
    }

    // Otherwise treat as food log, reply with progress summary
    let reply = '你好！\n';
    if (currentWeight) {
      reply += '目前體重：' + currentWeight + ' kg\n';
    } else {
      reply += '目前體重：尚未記錄\n';
    }
    if (targetWeight) {
      reply += '目標體重：' + targetWeight + ' kg\n';
    } else {
      reply += '目標體重：尚未設定\n';
    }
    if (currentWeight && targetWeight) {
      const diff = (currentWeight - targetWeight).toFixed(1);
      reply += '距離目標還有 ' + diff + ' kg\n';
    }
    reply += '\n飲食紀錄已收到，請在下個時間輸入飲食紀錄';

    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }
}

app.get('/logs', (req, res) => {
  res.json({ userId: userId, currentWeight: currentWeight, targetWeight: targetWeight, logs: logs });
});

function sendMessage(text) {
  if (!userId) {
    console.log('No userId saved yet, cannot send message');
    return;
  }
  client.pushMessage(userId, { type: 'text', text: text });
}

cron.schedule('0 10 * * *', () => {
  sendMessage('早安！早餐吃了什麼呢？告訴我一下吧');
}, { timezone: 'Asia/Taipei' });

cron.schedule('30 12 * * *', () => {
  sendMessage('午餐時間！吃了什麼呢？');
}, { timezone: 'Asia/Taipei' });

cron.schedule('0 19 * * *', () => {
  sendMessage('晚餐吃了什麼呢？跟我說說吧');
}, { timezone: 'Asia/Taipei' });

cron.schedule('0 0 * * *', () => {
  sendMessage('該睡覺了！喝點溫水幫助入睡，記得輸入今天的體重數據哦');
}, { timezone: 'Asia/Taipei' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
