import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { CreateMessageRequest, DBMessage } from '@/lib/types/conversation'

type RouteParams = {
  params: Promise<{ id: string }>
}

// POST /api/conversations/[id]/messages - Add message to conversation
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify conversation belongs to user
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const body: CreateMessageRequest = await request.json()

  if (!body.role || !body.content) {
    return NextResponse.json({ error: 'Missing required fields: role, content' }, { status: 400 })
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: body.role,
      content: body.content,
      wireframe: body.wireframe || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating message:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update conversation's updated_at and wireframe if provided
  if (body.wireframe) {
    await supabase
      .from('conversations')
      .update({ wireframe: body.wireframe })
      .eq('id', conversationId)
  } else {
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  }

  return NextResponse.json({ message: message as DBMessage }, { status: 201 })
}
