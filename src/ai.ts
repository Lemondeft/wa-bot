import 'dotenv/config'

interface Message {
  role: 'user' | 'assistant'
  content: string | Array<{type: 'text', text: string} | {type: 'image_url', image_url: {url: string}}>
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
  return callLLM(SYSTEM_PROMPT, history)
}

const SUMMARIZE_SYSTEM_PROMPT = `
You summarize WhatsApp chats so the user can quickly catch up on conversations they missed without reading the full chat.

Rules:
- Answer the user's implicit question: "what happened?" Cover the key topics in chronological order, who said what, important facts and details, any decisions or plans made, and any open questions that still need attention.
- Keep concrete facts intact: names, numbers, dates, times, prices, links, addresses. Do not lose them through paraphrasing.
- Be informative and complete but concise. Use short lines and dash bullets ("- item") for readability.
- The summary must render as PLAIN TEXT. Never use markdown, asterisks, underscores, backticks, or any other formatting characters (*, _, ~, \`, #) — WhatsApp will show them literally. Use "-" bullets, line breaks, and plain words for emphasis instead.
- The chat may contain bot commands like !img, !sticker, !reveal, !status, !clear, !summarize — ignore that noise unless it matters to the actual conversation.
- If an "Extra context" note is included, treat it as background the user supplied and weave it in where relevant.
- Summarize in the language the conversation is mostly written in (e.g. Indonesian chat -> Indonesian summary).
- Never invent facts not present in the transcript. If there is barely any real conversation, say that instead of padding.
- Use emojis sparingly, only to mark important or actionable points.
`

function formatHistory(history: Message[]): string {
  return history.map((m) => {
    const content = Array.isArray(m.content)
      ? m.content.map((part) => part.type === 'image_url' ? '[image]' : part.text).join(' ')
      : m.content
    return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`
  }).join('\n')
}

export async function summarize(history: Message[], extraContext: string): Promise<string> {
  const messages: Message[] = []
  if (extraContext) {
    messages.push({ role: 'user', content: `Extra context (background supplied by the user, not part of the chat):\n${extraContext}` })
  }
  messages.push({ role: 'user', content: `Here is the chat transcript:\n\n${formatHistory(history)}` })
  return callLLM(SUMMARIZE_SYSTEM_PROMPT, messages)
}

async function callLLM(systemPrompt: string, messages: Message[]): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.KEY}`,
    },
    body: JSON.stringify({
      model: 'poolside/laguna-s-2.1:free',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
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