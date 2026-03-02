import 'dotenv/config'

export async function generateImage(prompt: string): Promise<string | null> {
    try {
        const res = await fetch('https://api.voidai.app/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.KEY}`,
            },
            body: JSON.stringify({
                model: 'gemini-3.1-flash-image-preview',
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1000
            })
        })

        const data = await res.json() as any
        console.log('[IMAGE DEBUG] Status:', res.status)
        console.log('[IMAGE DEBUG] Full JSON:', JSON.stringify(data, null, 2))

        const content = data.choices?.[0]?.message?.content
        console.log('[IMAGE DEBUG] Content:', content)

        const imageUrlMatch = content?.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/)
        console.log('[IMAGE DEBUG] Matched URL:', imageUrlMatch?.[1])

        return imageUrlMatch?.[1] ?? null
    } catch (err: any) {
        console.error('Image gen error:', err?.message)
        return null
    }
}
