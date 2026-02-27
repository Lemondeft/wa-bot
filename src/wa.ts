import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.js'
import { chat } from './ai.js'

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
            const jid = msg.key.remoteJid
            if (!msg.message || !jid) continue
            if (jid.endsWith('@lid')) continue

            const msgId = msg.key.id!
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
                const isGroup = jid.endsWith('@g.us')
                await sock.sendMessage(jid, { text: reply }, isGroup ? {} : { quoted: msg })
            } catch (err) {
                console.error('Error:', err)
            }
        }
    })
}