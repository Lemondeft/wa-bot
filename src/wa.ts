import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.js'
import { chat } from './ai.js'

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

async function sendWithTyping(sock: any, jid: string, text: string, quotedMsg?: any) {
    const chunks = splitIntoChunks(text, 150)
    const isGroup = jid.endsWith('@g.us')

    for (let i = 0; i < chunks.length; i++) {
        try { await sock.sendPresenceUpdate('composing', jid) } catch { }

        const delay = Math.min((chunks[i]?.length ?? 50) * 25, 3000)
        await new Promise(res => setTimeout(res, delay))

        await sock.sendMessage(
            jid,
            { text: chunks[i] },
            isGroup ? {} : (i === 0 ? { quoted: quotedMsg } : {})
        )
    }

    try { await sock.sendPresenceUpdate('available', jid) } catch { }
}
export async function startBot(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        getMessage: async () => ({ conversation: '' })
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === 'close') {
            const code = (lastDisconnect?.error as any)?.output?.statusCode
            if (code !== DisconnectReason.loggedOut) setTimeout(() => startBot(), 5000)
        } else if (connection === 'open') {
            console.log('Connected!')
        }
    })

    const seen = new Set<string>()

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            const jid = msg.key?.remoteJid
            const msgId = msg.key?.id

            if (!msg.message || !jid || !msgId) continue
            if (jid.endsWith('@lid')) continue
            if (seen.has(msgId)) continue
            seen.add(msgId)
            setTimeout(() => seen.delete(msgId), 60000)

            const text = (
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                ''
            ).trim()

            if (!text.startsWith('!ai') && text !== '!clear') continue

            if (text === '!clear') {
                clearHistory(jid)
                await sock.sendMessage(jid, { text: 'Chat history cleared!' })
                continue
            }

            const prompt = text.slice(4).trim()
            if (!prompt) continue

            console.log(`[${jid}] ${prompt}`)
            const history = appendHistory(jid, 'user', prompt)

            try {
                const reply = await chat(history)
                appendHistory(jid, 'assistant', reply)

                await sendWithTyping(sock, jid, reply, msg)

            } catch (err) {
                console.error('Error:', err)
            }
        }
    })
}