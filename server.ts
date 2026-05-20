import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import ytdl from '@distube/ytdl-core';
import 'dotenv/config';

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is missing");
  return new GoogleGenAI({ apiKey });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  app.post('/api/analyze-youtube', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      console.log('Fetching youtube audio for:', url);
      const info = await ytdl.getInfo(url);
      const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
      
      const stream = ytdl.downloadFromInfo(info, { format: audioFormat });
      
      const chunks: Uint8Array[] = [];
      let currentSize = 0;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
        currentSize += chunk.length;
        if (currentSize > 6 * 1024 * 1024) { 
           stream.destroy();
           throw new Error("المقطع طويل جداً (أكبر من 6 ميجابايت). يرجى اختيار أغنية أقصر أو رفع المقطع كملف.");
        }
      }
      
      const buffer = Buffer.concat(chunks);
      const base64Data = buffer.toString('base64');
      const mimeType = audioFormat.mimeType ? audioFormat.mimeType.split(';')[0] : 'audio/webm';
      
      console.log('Sending buffer to Gemini. Size (MB):', (buffer.length / 1024 / 1024).toFixed(2));
      
      const ai = getAiClient();
      
      const sysPrompt = `أنت مهندس صوت ومنتج موسيقي وموزع عالمي وباحث موسيقي محترف جداً بخصائص الذكاء الاصطناعي الفائق.
مهمتك: استمع للمقطع الصوتي الذي قمنا باستخراجه من الرابط بأقصى دقة ممكنة بالاعتماد على التحليل السمعي الفعلي للملف.
المطلوب منك تحليل وتفكيك موسيقي شامل جداً:
1. تصنيف النوع الموسيقي بدقة عالية (Exact Genre / Sub-genre).
2. الروح والحالة العامة للتراك (Vibe/Mood/Atmosphere).
3. وصف فني دقيق للتركيبة والتوزيع: كيف تم صناعة هذا الإيقاع والأسلوب، وما هي الآلات الموسيقية (Instruments) ونوع الـ Synthesizers إذا وُجدت، وكيفية إعداد الـ (Drums/Bass).
4. استنتاج وتحديد المقام (Maqam) أو السلم الموسيقي (Scale)، وتوضيح سرعة الإيقاع (Tempo/BPM) المرجح.
5. استخراج "برومبت إنجليزي فائق الدقة" (Highly Detailed AI Music Prompt) صالح للاستخدام في Suno AI أو Udio لتوليد موسيقى مشابهة تماماً، مع تقديم شرح وتعقيب باللغة العربية حول سبب اختيار هذا البرومبت وكيف يمكن للمستخدم استغلاله.
6. تقديم أمثلة ومقترحات حقيقية دقيقة جداً لأغاني أو تراكات أخرى مشابهة نفس الستايل على يوتيوب بالاسم الدقيق (Exact names and artists).

تأكد من عدم تقليل الجودة وأن تكون إجاباتك مفصلة وتشع بالخبرة والأذن الموسيقية الدقيقة، وكل معلوماتك يجب أن تبنى على ما سمعته والمحتوى الصوتي الذي أُعطي لك الآن!`;

      const promptText = "أعطني تحليلاً وتفكيكاً موسيقياً شاملاً ودقيقاً للغاية لهذا المقطع الصوتي، وضع ببالك كل نقطة تم طلبها.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          promptText
        ],
        config: { systemInstruction: sysPrompt }
      });
      
      res.json({ result: response.text });
    } catch (error: any) {
      console.error("YouTube analysis error:", error);
      res.status(500).json({ error: error.message || 'Error processing YouTube URL' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();