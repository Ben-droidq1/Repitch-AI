import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTranscript } from 'youtube-transcript';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not found in .env file');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'vite-project', 'dist');
const YOUTUBE_URL_PATTERN = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"')]+/gi;

function findYoutubeUrls(text) {
  return [...new Set((text.match(YOUTUBE_URL_PATTERN) || []).map((url) => url.replace(/[.,;:!?]+$/, '')))];
}

async function appendYoutubeTranscripts(prompt) {
  const urls = findYoutubeUrls(prompt);
  if (urls.length === 0) return prompt;

  const transcriptBlocks = [];
  for (const url of urls) {
    try {
      const transcript = await fetchTranscript(url);
      const text = transcript.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();

      if (!text) {
        throw new Error('Transcript was empty.');
      }

      transcriptBlocks.push(`YouTube URL: ${url}\nTranscript:\n${text}`);
    } catch (error) {
      const message = error?.message || 'Could not fetch transcript.';
      const details = 'This video may not have public captions/transcripts enabled. Paste the transcript manually, or try another YouTube video with captions.';
      const failure = new Error(`Could not read the YouTube link: ${message} ${details}`);
      failure.status = 422;
      throw failure;
    }
  }

  return `${prompt}\n\nFetched YouTube reference material:\n---\n${transcriptBlocks.join('\n\n')}\n---`;
}

app.post('/api/generate', async (req, res) => {
  try {
    const { messages, system } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }

    const prompt = messages
      .map((message) => message.content)
      .filter(Boolean)
      .join('\n\n');
    const enrichedPrompt = await appendYoutubeTranscripts(prompt);
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: system
          ? {
              parts: [{ text: system }],
            }
          : undefined,
        contents: [
          {
            role: 'user',
            parts: [{ text: enrichedPrompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
        },
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      const fallbackText = await response.text();
      data = fallbackText ? { error: fallbackText } : { error: 'Upstream Gemini API returned an empty response.' };
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim();
    res.json({ ...data, text });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to generate content.' });
  }
});

app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
