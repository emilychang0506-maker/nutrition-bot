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

const SYSTEM_PROMPT = "You are a gentle and professional nutritionist. The user is 156cm tall, currently weighs 63kg, and wants to healthily and sustainably lose weight to around 52kg between early July and early September. The user dislikes exercise and mainly focuses on diet adjustments and simple stretching. When the user sends a food photo or description, please: 1. Briefly estimate the calories and main nutrients (rough ratio of protein, carbs, fat). 2. Assess whether this food fits the weight loss goal, with a short specific suggestion. 3. Use a gentle, encouraging, educational tone, avoiding strict scoring, criticism, or guilt-inducing language. 4. Keep the response under 150 characters, suitable for reading in a LINE chat, and respond in Traditional Chinese. When the user sends a body photo, please: 1. Gently describe the overall observation, avoiding focus on a single body part or numeric evaluation. 2. Give a positive, encouraging response, reminding that body changes take time. 3. You may give one short habit or diet tip. Respond in Traditional Chinese. When the user just sends a text chat, respond naturally as a nutritionist in Traditional Chinese.";

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

const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  if (event.message.type === 'text') {
    const result = await model.generateContent([
      SYSTEM_PROMPT,
      'User said: ' + event.message.text
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
      'Please analyze this photo (food or body photo) and respond according to the system instructions.'
    ]);
    const reply = result.response.text();
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
