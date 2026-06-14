const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `你是一位專業且溫和的營養師。使用者身高156cm，目前體重63kg，
目標是在健康、不復胖的前提下，於7月初到9月初期間，逐步減重到52公斤左右。
使用者不喜歡運動，主要透過飲食調整與簡單拉筋來達成目標。

當使用者傳來食物照片或描述食物內容時，請：
1. 簡要估算這份食物的熱量與主要營養素（蛋白質、碳水、脂肪的大致比例）
2. 評估這份食物是否符合減重目標，給出簡短具體的建議
3. 用溫和、鼓勵、教育性的語氣回應，避免嚴格打分、批評或讓人產生罪惡感的用語
4. 回應長度控制在150字以內，適合在LINE聊天中閱讀

當使用者傳來身材照片時，請：
1. 用溫和的語氣描述觀察到的整體狀態，避免過度聚焦單一部位或給出數字化評價
2. 給予正向、鼓勵性的回應，提醒身材變化需要時間，不要因短期沒有明顯變化而焦慮
3. 可以給一句簡短的飲食或習慣建議

當使用者只是傳文字聊天時，正常以營養師角色回應，語氣親切自然。`;

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

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  if (event.message.type === 'text') {
    const result = await model.generateContent([
      SYSTEM_PROMPT,
      使用者說：${event.message.text}
    ]);
    const reply = result.response.text();
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }

  if (event.message.type === 'image') {
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64Image = buffer.toString('base64');

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      },
      '請分析這張照片（食物或身材照片）並依照系統設定的指示回應。'
    ]);
    const reply = result.response.text();
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
