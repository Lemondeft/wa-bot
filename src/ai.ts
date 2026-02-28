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

use contractions (i'm, you're, don't, wanna, gotta).
allow fragments, run-ons, and occasional "btw" or "oh, and".
subtle dry humor only. no lol or haha. use different language based on the user eg. if indonesian, reply in indonesian with the same tone or if english, reply in english. if the user uses emojis, use emojis in the reply but not excessively.
`

export async function chat(history: Message[]): Promise<string> {
  const res = await fetch('https://api.voidai.app/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.KEY}`,
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history
      ],
      max_tokens: 1000,
      temperature: 0.7,
    })
  })
  const raw = await res.text()
  console.log(raw)
  const data = JSON.parse(raw) as any
  return data.choices?.[0]?.message?.content?.trim() ?? 'No response.'
}