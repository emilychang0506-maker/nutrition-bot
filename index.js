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
let currentWeight = null;
let targetWeight = null;

let meals = {
  breakfast: null,
  lunch: null,
  dinner: null,
  snack: null
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

function getEstimateText() {
  if (currentWeight === null || targetWeight === null) return '';
  const diff = currentWeight - targetWeight;
  if (diff <= 0) return '\n你已經達到目標體重了！太棒了';
  const weeks = Math.ceil(diff / 0.3);
  return '\n以每週至少減 0.3 kg 估算，大約還需要 ' + weeks + ' 週可達成目標';
}

async function handleEvent(event) {
  if (event.type !== 'message') return;

  if (event.source && event.source.userId) {
    userId = event.source.userId;
  }

  if (event.message.type !== 'text') return;

  const text = event.message.text.trim();

  // Target weight: "目標52"
  const targetMatch = text.match(/^目標\s*(\d+(\.\d+)?)$/);
  if (targetMatch) {
    targetWeight = parseFloat(targetMatch[1]);
    const reply = '好的！目標體重已設定為 ' + targetWeight + ' kg';
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }

  // Current weight: plain number
  const weightMatch = text.match(/^(\d+(\.\d+)?)$/);
  if (weightMatch) {
    currentWeight = parseFloat(weightMatch[1]);
    let reply = '已記錄今日體重：' + currentWeight + ' kg';
    if (targetWeight !== null) {
      const diff = (currentWeight - targetWeight).toFixed(1);
      reply += '\n距離目標還有 ' + diff + ' kg';
      reply += getEstimateText();
    }
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }

  // Meal entries: "早餐：xxx", "午餐：xxx", "晚餐：xxx", "點心：xxx"
  const mealMatch = text.match(/^(早餐|午餐|晚餐|點心)[：:]\s*(.+)$/);
  if (mealMatch) {
    const mealNameMap = {
      '早餐': 'breakfast',
      '午餐': 'lunch',
      '晚餐': 'dinner',
      '點心': 'snack'
    };
    const mealKey = mealNameMap[mealMatch[1]];
    const content = mealMatch[2].trim();
    meals[mealKey] = content;

    const reply = '你好！今天' + mealMatch[1] + '吃了' + content;
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }

  // Anything else
  const reply = '祝你早日達成目標！記得多喝水！';
  return client.replyMessage(event.replyToken, { type: 'text', text: reply });
}

app.get('/logs', (req, res) => {
  res.json({ userId: userId, currentWeight: currentWeight, targetWeight: targetWeight, meals: meals });
});

function sendMessage(text) {
  if (!userId) {
    console.log('No userId saved yet, cannot send message');
    return;
  }
  client.pushMessage(userId, { type: 'text', text: text });
}

// 10:00 - breakfast
cron.schedule('0 10 * * *', () => {
  if (meals.breakfast) {
    sendMessage('你好！今天早餐吃了' + meals.breakfast);
  } else {
    sendMessage('早安！還沒收到你的早餐紀錄，記得輸入「早餐：你吃的東西」喔');
  }
}, { timezone: 'Asia/Taipei' });

// 12:30 - lunch
cron.schedule('30 12 * * *', () => {
  if (meals.lunch) {
    sendMessage('你好！今天午餐吃了' + meals.lunch);
  } else {
    sendMessage('午餐時間！還沒收到你的午餐紀錄，記得輸入「午餐：你吃的東西」喔');
  }
}, { timezone: 'Asia/Taipei' });

// 19:00 - dinner
cron.schedule('0 19 * * *', () => {
  if (meals.dinner) {
    sendMessage('你好！今天晚餐吃了' + meals.dinner);
  } else {
    sendMessage('晚餐時間！還沒收到你的晚餐紀錄，記得輸入「晚餐：你吃的東西」喔');
  }
}, { timezone: 'Asia/Taipei' });

// 00:00 - daily summary, then reset for next day
cron.schedule('0 0 * * *', () => {
  let summary = '今天的飲食紀錄整理：\n';
  summary += '早餐：' + (meals.breakfast || '未記錄') + '\n';
  summary += '午餐：' + (meals.lunch || '未記錄') + '\n';
  summary += '晚餐：' + (meals.dinner || '未記錄') + '\n';
  summary += '點心：' + (meals.snack || '無') + '\n\n';

  if (currentWeight !== null && targetWeight !== null) {
    const diff = (currentWeight - targetWeight).toFixed(1);
    summary += '目前體重：' + currentWeight + ' kg\n';
    summary += '距離目標還有 ' + diff + ' kg';
    summary += getEstimateText() + '\n\n';
  }

  summary += '該睡覺了！喝點溫水幫助入睡，記得輸入今天的體重數據哦';

  sendMessage(summary);

  meals = { breakfast: null, lunch: null, dinner: null, snack: null };
}, { timezone: 'Asia/Taipei' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
