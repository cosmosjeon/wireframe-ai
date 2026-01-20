import { NextRequest, NextResponse } from 'next/server'

const GLM_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions'
const GLM_API_KEY = process.env.GLM_API_KEY

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (!GLM_API_KEY) {
      // Fallback if API key not configured
      const fallbackTitle = message.slice(0, 30) + (message.length > 30 ? '...' : '')
      return NextResponse.json({ title: fallbackTitle })
    }

    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [
          {
            role: 'system',
            content: `You are a title generator. Generate a concise, descriptive title (max 30 characters) for a conversation based on the user's first message. The title should capture the main topic or intent. Respond with ONLY the title, nothing else. If the message is in Korean, respond in Korean. If in English, respond in English.`
          },
          {
            role: 'user',
            content: `Generate a title for this message: "${message}"`
          }
        ],
        max_tokens: 50,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GLM API Error:', response.status, errorText)
      // Fallback to truncated message
      const fallbackTitle = message.slice(0, 30) + (message.length > 30 ? '...' : '')
      return NextResponse.json({ title: fallbackTitle })
    }

    const data = await response.json()
    let title = data.choices?.[0]?.message?.content?.trim() || message.slice(0, 30)

    // Ensure title is not too long
    if (title.length > 40) {
      title = title.slice(0, 37) + '...'
    }

    // Remove quotes if the model added them
    title = title.replace(/^["']|["']$/g, '')

    return NextResponse.json({ title })
  } catch (error) {
    console.error('Generate title error:', error)
    // Fallback: return truncated message
    try {
      const { message } = await request.clone().json()
      const fallbackTitle = message?.slice(0, 30) + (message?.length > 30 ? '...' : '') || 'New Conversation'
      return NextResponse.json({ title: fallbackTitle })
    } catch {
      return NextResponse.json({ title: 'New Conversation' })
    }
  }
}
