import { handleAPIError, createRateLimitResponse } from '@/lib/api-errors'
import { Duration } from '@/lib/duration'
import { getModelClient, LLMModel, LLMModelConfig } from '@/lib/models'
import { buildSystemPrompt } from '@/lib/wireframe-prompt'
import ratelimit from '@/lib/ratelimit'
import { excalidrawSchema as schema } from '@/lib/schema'
import { streamObject, LanguageModel, CoreMessage } from 'ai'

export const maxDuration = 300

const rateLimitMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
  ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
  : 10
const ratelimitWindow = process.env.RATE_LIMIT_WINDOW
  ? (process.env.RATE_LIMIT_WINDOW as Duration)
  : '1d'

export async function POST(req: Request) {
  const {
    messages,
    currentElements,
    workflowMode,
    userID,
    teamID,
    model,
    config,
  }: {
    messages: CoreMessage[]
    currentElements?: any[]
    workflowMode?: boolean
    userID: string | undefined
    teamID: string | undefined
    model: LLMModel
    config: LLMModelConfig
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

  const { model: modelNameString, apiKey: modelApiKey, ...modelParams } = config
  const modelClient = getModelClient(model, config)

  try {
    // Build system prompt based on workflow mode and canvas state
    const systemPrompt = buildSystemPrompt(workflowMode ?? false, currentElements)

    const stream = await streamObject({
      model: modelClient as LanguageModel,
      schema,
      system: systemPrompt,
      messages,
      maxRetries: 0,
      maxTokens: 16000,
      ...modelParams,
    })

    return stream.toTextStreamResponse()
  } catch (error: any) {
    return handleAPIError(error, { hasOwnApiKey: !!config.apiKey })
  }
}
