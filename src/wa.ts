import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, proto } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.js'
import { chat } from './ai.js'
import { Boom } from '@hapi/boom'

function splitIntoChunks(text: string, maxSize = 150): string[] {
    const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text]
    const chunks: string[] = []
    let current = ''

    for (const sentence of sentences) {
        if ((current + sentence).length > maxSize && current) {
            chunks.push(current.trim())
            current = sentence
        } else {
            current += sentence
        }
    }

    if (current.trim()) chunks.push(current.trim())
    return chunks
}

async function sendWithTypingAndQuote(
  sock: any,
  jid: string,
  text: string,
  quotedMsg?: proto.IWebMessageInfo
) {
  const chunks = splitIntoChunks(text, 150)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!

    try {
      await sock.sendPresenceUpdate('composing', jid)
    } catch {}

    const baseDelay = 300
    const perChar = 18
    const jitter = Math.random() * 300
    const delay = Math.min(baseDelay + chunk.length * perChar + jitter, 2500)

    await new Promise(res => setTimeout(res, delay))

    if (i === 0 && quotedMsg) {
      await sock.sendMessage(jid, { text: chunk }, { quoted: quotedMsg })
    } else {
      await sock.sendMessage(jid, { text: chunk })
    }

    try {
      await sock.sendPresenceUpdate('paused', jid)
    } catch {}

    await new Promise(res => setTimeout(res, 400 + Math.random() * 400))
  }

  try {
    await sock.sendPresenceUpdate('available', jid)
  } catch {}
}

export async function startBot(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        getMessage: async () => proto.Message.create({ conversation: '' })
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => startBot(), 5000)
            }
        } else if (connection === 'open') {
            console.log('Connected')
        }
    })

    const seen = new Set<string>()
    const rateLimits = new Map<string, number>()

    sock.ev.process(async (events) => {
    if (events['messages.upsert']) {
        const { messages, type } = events['messages.upsert']
        
        if (type !== 'notify') return

        for (const msg of messages) {
            const jid = msg.key?.remoteJid
            const msgId = msg.key?.id
            const isGroup = jid?.endsWith('@g.us')

            if (!jid || !msgId) continue
            if (seen.has(msgId)) continue
            seen.add(msgId)
            setTimeout(() => seen.delete(msgId), 60000)

            try {
                const text = (
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption
                )?.trim()

                if (!text) continue
                
                if (msg.message?.pollCreationMessage || msg.message?.pollUpdateMessage) {
                    continue
                }
                
                if (!text.startsWith('!ai') && text !== '!clear') continue

                const userId = msg.key.participant || jid
                const lastCall = rateLimits.get(userId) || 0
                const now = Date.now()
                const cooldown = 3000

                if (now - lastCall < cooldown) {
                    const remaining = Math.ceil((cooldown - (now - lastCall)) / 1000)
                    console.log(`[RATE LIMIT] ${userId.split('@')[0]} ${remaining}s`)
                    
                    await sock.sendMessage(jid, { text: `Wait ${remaining} seconds` }, { quoted: msg })
                    continue
                }
                rateLimits.set(userId, now)

                const sender = isGroup 
                    ? msg.key.participant?.split('@')[0] 
                    : jid.split('@')[0]
                const chatType = isGroup ? 'GROUP' : 'DM'
                
                if (text === '!clear') {
                    clearHistory(jid)
                    console.log(`[${chatType}] ${sender} !clear`)
                    await sock.sendMessage(jid, { text: 'Chat history cleared' }, { quoted: msg })
                    continue
                }

                const prompt = text.slice(4).trim()
                if (!prompt) continue

                console.log(`[${chatType}] ${sender} ${prompt}`)
                
                const history = appendHistory(jid, 'user', prompt)
                const reply = await chat(history)
                appendHistory(jid, 'assistant', reply)
                
                console.log(`[${chatType}] BOT ${reply.slice(0, 50)}...`)
                
                await sendWithTypingAndQuote(sock, jid, reply, msg)

            } catch (err: any) {
                console.error(err?.message)
            }
        }
    }
})
}