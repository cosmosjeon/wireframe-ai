import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { Conversation, CreateConversationRequest } from '@/lib/types/conversation'

// GET /api/conversations - List user's conversations
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  console.log('[API] getUser result:', { user: user?.id, error: userError?.message })

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized', details: userError?.message }, { status: 401 })
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversations: conversations as Conversation[] })
}

// POST /api/conversations - Create new conversation
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateConversationRequest = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is fine, will use defaults
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title: body.title || 'New Conversation',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversation: conversation as Conversation }, { status: 201 })
}
