import 'dotenv/config'

export async function generateImage(prompt: string): Promise<string | null> {
    try {
        const res = await fetch('https://beta.voidai.app/v1/chat/completions', {
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
        console.log('[IMAGE DEBUG] Full response:', JSON.stringify(data, null, 2))

        // Check ALL possible fields
        const content = data.choices?.[0]?.message?.content
        const toolCalls = data.choices?.[0]?.message?.tool_calls
        const imageData = data.data
        const error = data.error
        
        console.log('[IMAGE DEBUG] Content:', content)
        console.log('[IMAGE DEBUG] Tool calls:', toolCalls)
        console.log('[IMAGE DEBUG] Image data:', imageData)
        console.log('[IMAGE DEBUG] Error:', error)
        console.log('[IMAGE DEBUG] All choices:', JSON.stringify(data.choices, null, 2))

        let imageUrl = null
        if (content) {
            const match = content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/)
            imageUrl = match?.[1]
        }

        if (!imageUrl && content) {
            const match = content.match(/https?:\/\/[^\s\)"'\]]+/i)
            imageUrl = match?.[0]
        }

        if (!imageUrl && imageData?.[0]?.url) {
            imageUrl = imageData[0].url
        }

        if (!imageUrl && imageData?.[0]?.b64_json) {
            console.log('[IMAGE DEBUG] Got base64 image, converting...')
            imageUrl = `data:image/png;base64,${imageData[0].b64_json}`
        }

        console.log('[IMAGE DEBUG] Final URL:', imageUrl)

        return imageUrl

    } catch (err: any) {
        console.error('[IMAGE ERROR]', err?.message)
        return null
    }
}