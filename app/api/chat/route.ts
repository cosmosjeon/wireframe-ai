import { handleAPIError, createRateLimitResponse } from '@/lib/api-errors'
import { Duration } from '@/lib/duration'
import { getModelClient, LLMModel, LLMModelConfig } from '@/lib/models'
import { buildSystemPrompt } from '@/lib/wireframe-prompt'
import ratelimit from '@/lib/ratelimit'
import { excalidrawSchema as schema } from '@/lib/schema'
import { streamObject, LanguageModel, CoreMessage } from 'ai'
import { canUseCredits, consumeCredits } from '@/lib/usage'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const maxDuration = 300

const rateLimitMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
  ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
  : 10
const ratelimitWindow = process.env.RATE_LIMIT_WINDOW
  ? (process.env.RATE_LIMIT_WINDOW as Duration)
  : '1d'

// Estimated tokens for pre-check (typical wireframe generation)
const ESTIMATED_TOKENS_PER_REQUEST = 5000

export async function POST(req: Request) {
  const {
    messages,
    currentElements,
    workflowMode,
    appMode,
    userID,
    teamID,
    model,
    config,
    conversationId,
  }: {
    messages: CoreMessage[]
    currentElements?: any[]
    workflowMode?: boolean
    appMode?: 'planning' | 'drawing'
    userID: string | undefined
    teamID: string | undefined
    model: LLMModel
    config: LLMModelConfig
    conversationId?: string
  } = await req.json()

  const limit = !config.apiKey
    ? await ratelimit(
        req.headers.get('x-forwarded-for'),
        rateLimitMaxRequests,
        ratelimitWindow,
      )
    : false

  if (limit) {
    return createRateLimitResponse(limit)
  }

  const supabase = await createServerSupabaseClient()
  let authenticatedUserId: string | null = null

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    authenticatedUserId = user?.id || null

    // Pre-check: verify user has enough credits
    if (authenticatedUserId && !config.apiKey) {
      const creditCheck = await canUseCredits(authenticatedUserId, ESTIMATED_TOKENS_PER_REQUEST)
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: creditCheck.reason || 'Insufficient credits',
            credits_balance: creditCheck.credits_balance,
            credits_needed: creditCheck.credits_needed,
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  const { model: modelNameString, apiKey: modelApiKey, ...modelParams } = config
  const modelClient = getModelClient(model, config)

  try {
    // Build system prompt based on workflow mode and canvas state
    const systemPrompt = buildSystemPrompt(workflowMode ?? false, currentElements, appMode)

    const result = await streamObject({
      model: modelClient as LanguageModel,
      schema,
      system: systemPrompt,
      messages,
      maxRetries: 0,
      maxTokens: 16000,
      ...modelParams,
    })

    // Process token usage after stream completes (in background)
    if (authenticatedUserId && !config.apiKey) {
      // Don't await - let it run in background after response starts
      processTokenUsage(
        result,
        authenticatedUserId,
        conversationId,
        model.id
      ).catch(console.error)
    }

    return result.toTextStreamResponse()
  } catch (error: any) {
    return handleAPIError(error, { hasOwnApiKey: !!config.apiKey })
  }
}

/**
 * Process token usage after stream completes
 * This runs in background to not block the response
 */
async function processTokenUsage(
  result: { usage: Promise<{ promptTokens: number; completionTokens: number; totalTokens: number } | undefined> },
  userId: string,
  conversationId?: string,
  modelId?: string
) {
  try {
    // Wait for the stream to complete and get usage
    const usage = await result.usage

    if (usage) {
      const idempotencyKey = `tokens_${userId}_${Date.now()}`

      const consumeResult = await consumeCredits(
        userId,
        usage.promptTokens,
        usage.completionTokens,
        conversationId,
        modelId,
        `Wireframe generation: ${usage.promptTokens} prompt + ${usage.completionTokens} completion tokens`,
        idempotencyKey
      )

      if (!consumeResult.success) {
        console.error('Failed to consume credits:', consumeResult.error_message)
      } else {
        console.log(
          `Credits consumed: ${consumeResult.credits_consumed} ` +
          `(${usage.totalTokens} tokens), remaining: ${consumeResult.credits_remaining}`
        )
      }
    }
  } catch (error) {
    console.error('Error processing token usage:', error)
  }
}
