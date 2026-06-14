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

function formatWeeks(weeks) {
  const months = Math.floor(weeks / 4);
  const remWeeks = weeks % 4;
  if (months === 0) {
    return weeks + ' 週';
  }
  if (remWeeks === 0) {
    return weeks + ' 週（約 ' + months + ' 個月）';
  }
  return weeks + ' 週（約 ' + months + ' 個月 ' + remWeeks + ' 週）';
}

function getEstimateText() {
  if (currentWeight === null || targetWeight === null) return '';
  const diff = currentWeight - targetWeight;
  if (diff <= 0) return '\n你已經達到目標體重了！太棒了';

  const weeksSlow = Math.ceil(diff / 0.3);
  const weeksFast = Math.ceil(diff / 0.5);

  let text = '\n以每週減 0.3 kg 估算，大約還需要 ' + formatWeeks(weeksSlow);
  text += '\n若加快到每週減 0.5 kg，大約還需要 ' + formatWeeks(weeksFast);
  return text;
}

function getProgressText() {
  let reply = '目前體重：' + (currentWeight !== null ? currentWeight + ' kg' : '尚未記錄') + '\n';
  reply += '目標體重：' + (targetWeight !== null ? targetWeight + ' kg' : '尚未設定');
  if (currentWeight !== null && targetWeight !== null) {
    const diff = (currentWeight - targetWeight).toFixed(1);
    reply += '\n距離目標還有 ' + diff + ' kg';
    reply += getEstimateText();
  }
  return reply;
}

function getMealsStatusText() {
  let reply = '早餐：' + (meals.breakfast || '還沒輸入') + '\n';
  reply += '午餐：' + (meals.lunch || '還沒輸入') + '\n';
  reply += '晚餐：' + (meals.dinner || '還沒輸入');
  if (meals.snack) {
    reply += '\n點心：' + meals.snack;
  }
  return reply;
}

async function handleEvent(event) {
  if (event.type !== 'message') return;

  if (event.source && event.source.userId) {
    userId = event.source.userId;
  }

  if (event.message.type !== 'text') return;

  const text = event.message.text.trim();

  // Target weight: "目標52", "目標體重：52", "目標體重52" etc.
  const targetMatch = text.match(/^目標(體重)?[：:]?\s*(\d+(\.\d+)?)$/);
  if (targetMatch) {
    targetWeight = parseFloat(targetMatch[2]);
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

    const reply = '你好！\n' + getMealsStatusText();
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }

  // Progress query
  if (text.includes('多遠') || text.includes('還要多久') || text.includes('多久') || (text.includes('目標') && text.includes('距離'))) {
    const reply = getProgressText();
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }

  // Anything else
  const reply = '祝你早日達成目標！記得多喝水！\n' + getProgressText();
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

cron.schedule('0 10 * * *', () => {
  if (meals.breakfast) {
    sendMessage('你好！今天早餐吃了' + meals.breakfast);
  } else {
    sendMessage('早安！還沒收到你的早餐紀錄，記得輸入「早餐：你吃的東西」喔');
  }
}, { timezone: 'Asia/Taipei' });

cron.schedule('30 12 * * *', () => {
  if (meals.lunch) {
    sendMessage('你好！今天午餐吃了' + meals.lunch);
  } else {
    sendMessage('午餐時間！還沒收到你的午餐紀錄，記得輸入「午餐：你吃的東西」喔');
  }
}, { timezone: 'Asia/Taipei' });

cron.schedule('0 19 * * *', () => {
  if (meals.dinner) {
    sendMessage('你好！今天晚餐吃了' + meals.dinner);
  } else {
    sendMessage('晚餐時間！還沒收到你的晚餐紀錄，記得輸入「晚餐：你吃的東西」喔');
  }
}, { timezone: 'Asia/Taipei' });

cron.schedule('0 0 * * *', () => {
  let summary = '今天的飲食紀錄整理：\n';
  summary += getMealsStatusText() + '\n\n';

  if (currentWeight !== null && targetWeight !== null) {
    summary += getProgressText() + '\n\n';
  }

  summary += '該睡覺了！喝點溫水幫助入睡，記得輸入今天的體重數據哦';

  sendMessage(summary);

  meals = { breakfast: null, lunch: null, dinner: null, snack: null };
}, { timezone: 'Asia/Taipei' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
