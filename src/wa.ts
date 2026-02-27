import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.js'
import { chat } from './ai.js'

export async function startBot(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const groupMetadataCache = new Map()

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        version,
        cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
        getMessage: async (key) => {
            return { conversation: '' }
        }
    })

    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            if (update.id) {
                const meta = await sock.groupMetadata(update.id)
                groupMetadataCache.set(update.id, meta)
            }
        }
    })

    sock.ev.on('group-participants.update', async ({ id }) => {
        const meta = await sock.groupMetadata(id)
        groupMetadataCache.set(id, meta)
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === 'close') {
            const code = (lastDisconnect?.error as any)?.output?.statusCode
            if (code !== DisconnectReason.loggedOut) startBot()
        } else if (connection === 'open') {
            console.log('Connected!')
            sock.groupFetchAllParticipating().then(groups => {
                for (const [id, meta] of Object.entries(groups)) {
                    groupMetadataCache.set(id, meta)
                }
                console.log(`Cached ${Object.keys(groups).length} groups`)
            })
        }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            if (!msg.message || !msg.key.remoteJid) continue

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

            try { await sock.sendPresenceUpdate('composing', jid) } catch { }

            try {
                const reply = await chat(history)
                console.log(`[AI] ${reply}`)
                appendHistory(jid, 'assistant', reply)
                await sock.sendMessage(jid, { text: reply })
            } catch (err) {
                console.error('send error:', err)
            }

            try { await sock.sendPresenceUpdate('available', jid) } catch { }
        }
    })
}