import 'dotenv/config'

const MAX_RETRIES = 3

async function callImageAPI(prompt: string): Promise<any> {
    const res = await fetch('https://beta.voidai.app/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.KEY}`,
        },
        body: JSON.stringify({
            model: 'gemini-3.1-flash-image-preview',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200000,
        })
    })

    if (res.status === 429) {
        throw new Error('rate limited')
    }

    return res.json()
}

export interface ImageResult {
    url: string
    caption?: string
}

export async function generateImage(prompt: string): Promise<ImageResult | 'RATE_LIMITED' | null> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                const delay = 3000 * attempt
                console.log(`[IMAGE] Retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s...`)
                await new Promise(res => setTimeout(res, delay))
            }

            const data = await callImageAPI(prompt) as any

            if (data.error) {
                console.error('[IMAGE ERROR]', data.error)
                if (data.error?.type === 'rate_limit' || data.error?.code === 429) continue
                return null
            }

            const message = data.choices?.[0]?.message

        const textContent = typeof message?.content === 'string' 
            ? message.content 
            : message?.content?.find((c: any) => c.type === 'text')?.text

        const caption = textContent?.replace(/!\[.*?\]\(https?:\/\/[^\)]+\)/g, '').replace(/https?:\/\/[^\s\)"'\]]+/gi, '').trim() || undefined

        if (Array.isArray(message?.images)) {
            for (const img of message.images) {
                const url = typeof img.image_url === 'string'
                    ? img.image_url
                    : img.image_url?.url
                if (url) return { url, caption }
            }
        }

        if (Array.isArray(message?.content)) {
            for (const item of message.content) {
                if (item.type === 'image_url') {
                    const raw = typeof item.image_url === 'string'
                        ? item.image_url
                        : item.image_url?.url
                    if (raw) {
                        const url = raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`
                        return { url, caption }
                    }
                }
            }
        }

        if (textContent) {
            const markdownMatch = textContent.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/)
            if (markdownMatch?.[1]) return { url: markdownMatch[1], caption }
            
            const urlMatch = textContent.match(/https?:\/\/[^\s\)"'\]]+/i)
            if (urlMatch?.[0]) return { url: urlMatch[0], caption }
        }

            return null

        } catch (err: any) {
            if (err?.message === 'rate limited') continue
            console.error('[IMAGE ERROR]', err?.message)
            return null
        }
    }

    console.error('[IMAGE ERROR] Max retries exceeded')
    return 'RATE_LIMITED'
}