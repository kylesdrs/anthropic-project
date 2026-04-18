require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
});

// In-memory store: messageId -> { meta, msgObject }
const messageStore = new Map();

client.on('qr', async (qr) => {
  console.log('QR Code received — scan with WhatsApp');
  const dataUrl = await qrcode.toDataURL(qr);
  io.emit('qr', dataUrl);
});

client.on('ready', () => {
  console.log('WhatsApp client ready');
  io.emit('status', { connected: true });
});

client.on('disconnected', () => {
  console.log('WhatsApp client disconnected');
  io.emit('status', { connected: false });
});

client.on('message', async (msg) => {
  if (msg.fromMe) return;

  const contact = await msg.getContact();
  const chat = await msg.getChat();

  const meta = {
    id: msg.id._serialized,
    from: contact.pushname || contact.name || contact.number || msg.from,
    number: msg.from,
    body: msg.body,
    timestamp: msg.timestamp * 1000,
    chatName: chat.name || contact.pushname || msg.from,
  };

  messageStore.set(meta.id, { meta, msg });
  io.emit('message', meta);
  console.log(`Message from ${meta.from}: ${meta.body}`);
});

// --- API: generate a Heat quote for a message ---
app.get('/api/generate-quote', async (req, res) => {
  const { messageId } = req.query;
  const entry = messageStore.get(messageId);
  if (!entry) return res.status(404).json({ error: 'Message not found' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are an expert on the 1995 Michael Mann crime film "Heat" starring Al Pacino and Robert De Niro. Your job is to pick the single most funny and contextually fitting Heat movie quote to reply to an incoming WhatsApp message.

The comedy works best when the intense, gravely serious tone of Heat's dialogue is applied to mundane or trivial messages — the absurdity of treating everyday life with the same weight as a $12 million heist.

Known Heat quotes you can draw from (use these verbatim or adapt slightly if needed):
- "Don't let yourself get attached to anything you are not willing to walk out on in 30 seconds flat if you feel the heat around the corner." — Neil McCauley
- "I'm alone, I am not lonely." — Neil McCauley
- "She's got a great ass, and you've got your head all the way up it." — Hanna
- "We want to hurt no one! We're here for the bank's money, not your money. Your money is insured by the federal government, you're not gonna lose a dime!" — Neil McCauley
- "What am I doing? I'm talking to an empty telephone." — Justine
- "All I am is what I'm going after." — Neil McCauley
- "You see me doing thrill-seeker liquor store holdups with a 'born to lose' tattoo on my chest?" — Neil McCauley
- "Cause there is a flip side to that coin. What if you do got me boxed in and I gotta put you down? Cause no matter what, you will not get in my way." — Neil McCauley
- "I may be on the other side of the law but I do what I do. You do what you do." — Neil McCauley
- "You're in my light." — Neil McCauley
- "I have one where I need to be. Only one." — Neil McCauley
- "My life's a disaster zone." — Hanna
- "I'm double parked on suicide." — Hanna
- "Neil, they're gonna burn you down. They're gonna burn you down." — Nate
- "Brother, you're going home." — Hanna
- "For me the sun don't shine, the rain don't... let's just say it don't." — Waingro
- "Give me all you got. We'll handle it." — Neil McCauley
- "Told you I'm never going back." — Neil McCauley
- "Because she's got a great ass." — Hanna (explaining why he stays with his wife)
- "What are you gonna do now?" "Figure something out." — Hanna/McCauley
- "A guy told me one time, don't let yourself get attached to anything you are not willing to walk out on in 30 seconds flat if you feel the heat around the corner. That's the discipline." — Neil McCauley
- "You live among the ruins of your life." — Hanna

Respond in EXACTLY this format (no extra text):
QUOTE: [the exact quote]
CHARACTER: [character name, e.g. Neil McCauley or Hanna]
WHY: [one punchy sentence, max 20 words, explaining the funny connection]`,
      messages: [
        {
          role: 'user',
          content: `Pick a Heat quote to reply to this WhatsApp message: "${entry.meta.body}"`,
        },
      ],
    });

    const text = response.content[0].text;
    const quote = (text.match(/QUOTE:\s*(.+?)(?:\n|$)/s) || [])[1]?.trim() ?? text;
    const character = (text.match(/CHARACTER:\s*(.+?)(?:\n|$)/s) || [])[1]?.trim() ?? 'Heat';
    const why = (text.match(/WHY:\s*(.+?)(?:\n|$)/s) || [])[1]?.trim() ?? '';

    res.json({ quote, character, why });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
});

// --- API: send the Heat quote as a reply ---
app.post('/api/send-reply', async (req, res) => {
  const { messageId, quote, character } = req.body;
  const entry = messageStore.get(messageId);
  if (!entry) return res.status(404).json({ error: 'Message not found' });

  try {
    const formatted = `"${quote}"\n— ${character}, Heat (1995)`;
    await entry.msg.reply(formatted);
    io.emit('replied', { messageId });
    res.json({ success: true });
  } catch (err) {
    console.error('Send error:', err.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

client.initialize();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\nHeat WhatsApp Bot running → http://localhost:${PORT}\n`);
});
