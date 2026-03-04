import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, proto, downloadMediaMessage } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { appendHistory, clearHistory } from './history.ts'
import { chat } from './ai.ts'
import { generateImage } from './image.ts'

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
        } catch { }

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
        } catch { }

        await new Promise(res => setTimeout(res, 400 + Math.random() * 400))
    }

    try {
        await sock.sendPresenceUpdate('available', jid)
    } catch { }
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
            const statusCode = (lastDisconnect?.error as Error & { output?: { statusCode: number } })?.output?.statusCode
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
                    const sender = isGroup
                        ? msg.key.participant?.split('@')[0]
                        : jid.split('@')[0]
                    const chatType = isGroup ? 'GROUP' : 'DM'

                    const hasImage = msg.message?.imageMessage
                    let imageBase64 = null
                    if (hasImage && text?.startsWith('!ai')) {
                        try {
                            const buffer = await downloadMediaMessage(
                                msg, 'buffer', {}, {
                                logger: {
                                    level: 'silent',
                                    child: () => ({} as any),
                                    trace: () => { },
                                    debug: () => { },
                                    info: () => { },
                                    warn: () => { },
                                    error: () => { },
                                    fatal: () => { }
                                } as any,
                                reuploadRequest: sock.updateMediaMessage
                            }
                            )
                            imageBase64 = (buffer as Buffer).toString('base64')
                            console.log(`[${chatType}] ${sender} sent image (${imageBase64.length} bytes)`)
                        } catch (err: any) {
                            console.error('Failed to download image:', err?.message)
                        }
                    }

                    if (!text) continue

                    if (msg.message?.pollCreationMessage || msg.message?.pollUpdateMessage) {
                        continue
                    }

                    if (!text.startsWith('!ai') && !text.startsWith('!img') && text !== '!clear' && !text.startsWith('!status')) continue

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

                    if (text.startsWith('!status')) (
                        await sock.sendMessage(jid, { text: 'Bot is running' }, { quoted: msg })
                    )
                    
                    if (text === '!clear') {
                        clearHistory(jid)
                        console.log(`[${chatType}] ${sender} !clear`)
                        await sock.sendMessage(jid, { text: 'Chat history cleared' }, { quoted: msg })
                        continue
                    }

                    if (text.startsWith('!ai')) {
                        const prompt = text.slice(4).trim()
                        if (!prompt && !imageBase64) continue  

                        console.log(`[${chatType}] ${sender} ${prompt}`)

                        let userContent: string | Array<any>

                        if (imageBase64) {
                            // Multimodal: text + image
                            userContent = prompt
                                ? [
                                    { type: 'text', text: prompt },
                                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                                ]
                                : [
                                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                                ]
                        } else {
                            userContent = prompt
                        }

                        const history = appendHistory(jid, 'user', userContent)
                        const reply = await chat(history)
                        appendHistory(jid, 'assistant', reply)

                        console.log(`[${chatType}] BOT ${reply.slice(0, 50)}...`)

                        await sendWithTypingAndQuote(sock, jid, reply, msg)
                        continue
                    }

                    if (text.startsWith('!img')) {
                        const prompt = text.slice(5).trim()
                        if (!prompt) {
                            await sock.sendMessage(jid, { text: 'usage: !img <description>' }, { quoted: msg })
                            continue
                        }

                        console.log(`[${chatType}] ${sender} !img ${prompt}`)

                        await sock.sendPresenceUpdate('composing', jid)
                        await sock.sendMessage(jid, { text: 'generating image...' }, { quoted: msg })

                        const imageUrl = await generateImage(prompt)

                        if (!imageUrl) {
                            await sock.sendMessage(jid, { text: 'failed to generate image' }, { quoted: msg })
                            continue
                        }
                        const imgBuffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())

                        await sock.sendMessage(jid, {
                            image: imgBuffer,
                            caption: prompt
                        }, { quoted: msg })

                        await sock.sendPresenceUpdate('available', jid)
                        continue
                    }

                } catch (err: any) {
                    console.error(err?.message)
                }
            }
        }
    })
}