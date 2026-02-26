import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.js'
import { chat } from './ai.js'


export async function startBot(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        version
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === 'close') {
            const code = (lastDisconnect?.error as any)?.output?.statusCode
            if (code !== DisconnectReason.loggedOut) startBot()
        } else if (connection === 'open') {
            console.log('Connected!')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe || !msg.key.remoteJid) continue

            const jid = msg.key.remoteJid
            const text =
                msg.message.conversation ??
                msg.message.extendedTextMessage?.text ??
                ''

            if (!text.startsWith('!ai') && text.trim() !== '!clear') continue

            if (text.trim() === '!clear') {
                clearHistory(jid)
                await sock.sendMessage(jid, { text: 'Chat history cleared!' })
                continue
            }

            const prompt = text.slice(4).trim()
console.log(`[${jid}] ${prompt}`)

const history = appendHistory(jid, 'user', prompt)

await sock.sendPresenceUpdate('composing', jid)

try {
    const reply = await chat(history)
    console.log(`[AI] ${reply}`)
    appendHistory(jid, 'assistant', reply)
    await sock.sendMessage(jid, { text: reply }, { quoted: msg })
} catch (err) {
    console.error(err)
    await sock.sendMessage(jid, { text: 'Error contacting AI.' })
}

await sock.sendPresenceUpdate('available', jid)
}})}