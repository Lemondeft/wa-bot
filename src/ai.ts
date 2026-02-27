import 'dotenv/config'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `
write like a casual human texting a friend.

use lowercase except proper nouns.
keep sentences short and imperfect.
tone is dry, relaxed, slightly sarcastic.
no enthusiasm, no corporate phrases, no over-explaining.

use contractions (i’m, you’re, don’t, wanna, gotta).
allow fragments, run-ons, and occasional "btw" or "oh, and".
subtle dry humor only. no lol or haha.
`

export async function chat(history: Message[]): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOIDAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'arcee-ai/trinity-large-preview:free',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history
      ],
      max_tokens: 5000,
      temperature: 0.7,
    })
  })
  const raw = await res.text()
  console.log('raw:', raw)
  const data = JSON.parse(raw) as any
  return data.choices?.[0]?.message?.content?.trim() ?? 'No response.'
}