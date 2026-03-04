import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, proto, downloadMediaMessage } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.ts'
import { chat } from './ai.ts'
import { generateImage } from './image.ts'

const RECONNECT_DELAY = 5000
const HEALTH_CHECK_INTERVAL = 60000
const INACTIVE_THRESHOLD = 5

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

async function sendWithTypingAndQuote(sock: any, jid: string, text: string, quotedMsg?: proto.IWebMessageInfo) {
    const chunks = splitIntoChunks(text, 150)

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!

        try { await sock.sendPresenceUpdate('composing', jid) } catch { }

        const delay = Math.min(300 + chunk.length * 18 + Math.random() * 300, 2500)
        await new Promise(res => setTimeout(res, delay))

        if (i === 0 && quotedMsg) {
            await sock.sendMessage(jid, { text: chunk }, { quoted: quotedMsg })
        } else {
            await sock.sendMessage(jid, { text: chunk })
        }

        try { await sock.sendPresenceUpdate('paused', jid) } catch { }
        await new Promise(res => setTimeout(res, 400 + Math.random() * 400))
    }

    try { await sock.sendPresenceUpdate('available', jid) } catch { }
}

const silentLogger = {
    level: 'silent',
    child: () => ({} as any),
    trace: () => { }, debug: () => { }, info: () => { },
    warn: () => { }, error: () => { }, fatal: () => { }
} as any

let currentHealthCheck: NodeJS.Timeout | null = null
let isReconnecting = false

function scheduleReconnect() {
    if (isReconnecting) return
    if (currentHealthCheck) {
        clearInterval(currentHealthCheck)
        currentHealthCheck = null
    }
    isReconnecting = true
    setTimeout(() => {
        isReconnecting = false
        startBot()
    }, RECONNECT_DELAY)
}

export async function startBot(): Promise<void> {
    if (isReconnecting) return

    if (currentHealthCheck) {
        clearInterval(currentHealthCheck)
        currentHealthCheck = null
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        getMessage: async () => proto.Message.create({ conversation: '' }),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    })

    sock.ev.on('creds.update', saveCreds)

    let connectionClosed = false

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })

        if (connection === 'close') {
            connectionClosed = true

            const statusCode = (lastDisconnect?.error as Error & {
                output?: { statusCode: number }
            })?.output?.statusCode

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 440
            console.log(`[CONNECTION CLOSED] Status: ${statusCode}, Reconnect: ${shouldReconnect}`)

            if (shouldReconnect) scheduleReconnect()
        } else if (connection === 'open') {
            console.log('[CONNECTED] Bot is online')
            connectionClosed = false
            isReconnecting = false
        }
    })

    const seen = new Set<string>()
    const rateLimits = new Map<string, number>()
    let lastActivity = Date.now()
    let isProcessing = false

    currentHealthCheck = setInterval(async () => {
        if (connectionClosed || isProcessing) return

        const ws = (sock as any).ws
        if (!ws || ws.readyState !== 1) {
            console.warn('[HEALTH CHECK] WebSocket not open, reconnecting...')
            sock.end(undefined)
            scheduleReconnect()
            return
        }

        const inactiveMins = (Date.now() - lastActivity) / 60000
        if (inactiveMins >= INACTIVE_THRESHOLD) {
            try {
                await sock.sendPresenceUpdate('available')
                lastActivity = Date.now()
            } catch {
                sock.end(undefined)
                scheduleReconnect()
            }
        }
    }, HEALTH_CHECK_INTERVAL)

    sock.ev.process(async (events) => {
        if (!events['messages.upsert']) return
        const { messages, type } = events['messages.upsert']
        if (type !== 'notify') return

        for (const msg of messages) {
            const jid = msg.key?.remoteJid
            const msgId = msg.key?.id
            if (!jid || !msgId) continue
            if (seen.has(msgId)) continue
            seen.add(msgId)
            setTimeout(() => seen.delete(msgId), 60000)

            lastActivity = Date.now()

            try {
                const text = (
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption
                )?.trim()

                const isGroup = jid.endsWith('@g.us')
                const sender = (isGroup ? msg.key.participant : jid)?.split('@')[0]
                const tag = isGroup ? 'GROUP' : 'DM'

                let imageBase64: string | null = null
                if (msg.message?.imageMessage && text?.startsWith('!ai')) {
                    try {
                        const buffer = await downloadMediaMessage(
                            msg, 'buffer', {},
                            { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }
                        )
                        imageBase64 = (buffer as Buffer).toString('base64')
                    } catch (err: any) {
                        console.error('Failed to download image:', err?.message)
                    }
                }

                if (!text) continue
                if (msg.message?.pollCreationMessage || msg.message?.pollUpdateMessage) continue
                if (!text.startsWith('!ai') && !text.startsWith('!img') && text !== '!clear' && !text.startsWith('!status')) continue

                const userId = msg.key.participant || jid
                const now = Date.now()
                const lastCall = rateLimits.get(userId) || 0
                if (now - lastCall < 3000) {
                    const remaining = Math.ceil((3000 - (now - lastCall)) / 1000)
                    await sock.sendMessage(jid, { text: `Wait ${remaining} seconds` }, { quoted: msg })
                    continue
                }
                rateLimits.set(userId, now)

                if (text.startsWith('!status')) {
                    await sock.sendMessage(jid, { text: 'Bot is running ✅' }, { quoted: msg })
                    continue
                }

                if (text === '!clear') {
                    clearHistory(jid)
                    console.log(`[${tag}] ${sender} !clear`)
                    await sock.sendMessage(jid, { text: 'Chat history cleared' }, { quoted: msg })
                    continue
                }

                if (text.startsWith('!ai')) {
                    const prompt = text.slice(4).trim()
                    if (!prompt && !imageBase64) continue

                    isProcessing = true
                    console.log(`[${tag}] ${sender} ${prompt}`)

                    const userContent = imageBase64
                        ? [
                            ...(prompt ? [{ type: 'text', text: prompt }] : []),
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                        ]
                        : prompt

                    const history = appendHistory(jid, 'user', userContent)
                    const reply = await chat(history)
                    appendHistory(jid, 'assistant', reply)

                    console.log(`[${tag}] BOT ${reply.slice(0, 50)}...`)

                    try {
                        await sendWithTypingAndQuote(sock, jid, reply, msg)
                    } catch (err: any) {
                        console.error('[SEND ERROR]', err?.message)
                    }
                    isProcessing = false
                    continue
                }

                if (text.startsWith('!img')) {
                    const prompt = text.slice(5).trim()
                    if (!prompt) {
                        await sock.sendMessage(jid, { text: 'usage: !img <description>' }, { quoted: msg })
                        continue
                    }

                    isProcessing = true
                    console.log(`[${tag}] ${sender} !img ${prompt}`)
                    await sock.sendMessage(jid, { text: 'generating image...' }, { quoted: msg })

                    const imageUrl = await generateImage(prompt)
                    if (!imageUrl || imageUrl === 'RATE_LIMITED') {
                        const msg_text = imageUrl === 'RATE_LIMITED' ? 'rate limited, try again later' : 'failed to generate image'
                        await sock.sendMessage(jid, { text: msg_text }, { quoted: msg })
                        isProcessing = false
                        continue
                    }

                    try {
                        let imgBuffer: Buffer
                        if (imageUrl.startsWith('data:image')) {
                            const base64Data = imageUrl.split(',')[1]
                            if (!base64Data) throw new Error('Invalid base64 format')
                            imgBuffer = Buffer.from(base64Data, 'base64')
                        } else {
                            const response = await fetch(imageUrl)
                            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
                            imgBuffer = Buffer.from(await response.arrayBuffer())
                        }

                        await sock.sendMessage(jid, { image: imgBuffer, caption: prompt }, { quoted: msg })
                    } catch (err: any) {
                        console.error(`[${tag}] Image send failed:`, err?.message)
                        await sock.sendMessage(jid, { text: 'failed to send image: ' + err?.message }, { quoted: msg })
                    }
                    isProcessing = false
                    continue
                }

            } catch (err: any) {
                console.error('[MESSAGE HANDLER ERROR]', err?.message)
            }
        }
    })
}