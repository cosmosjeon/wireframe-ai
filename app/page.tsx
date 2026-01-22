'use client'

import { ViewType } from '@/components/auth'
import { AuthDialog } from '@/components/auth-dialog'
import { Chat } from '@/components/chat'
import { ChatInput } from '@/components/chat-input'
import { ModePicker, AppMode } from '@/components/mode-picker'
import { NavBar } from '@/components/navbar'
import { Preview } from '@/components/preview'
import { StepIndicator } from '@/components/step-indicator'
import { ConversationSidebar } from '@/components/conversation-sidebar'
import { useAuth } from '@/lib/auth'
import { Message, toAISDKMessages, toMessageImage } from '@/lib/messages'
import { LLMModelConfig } from '@/lib/models'
import modelsList from '@/lib/models.json'
import { ExcalidrawSchema, excalidrawSchema as schema, wireframeStepSchema, ElementUpdate, WorkflowMode } from '@/lib/schema'
import { supabase } from '@/lib/supabase'
import { Conversation, DBMessage, MessageContent } from '@/lib/types/conversation'
import { DeepPartial } from 'ai'
import { ChevronsLeft, Sparkles } from 'lucide-react'
import { experimental_useObject as useObject } from 'ai/react'
import { usePostHog } from 'posthog-js/react'
import { SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { z } from 'zod'

type WireframeStep = z.infer<typeof wireframeStepSchema>

export default function Home() {
  const [chatInput, setChatInput] = useLocalStorage('chat', '')
  const [files, setFiles] = useState<File[]>([])
  const [languageModel, setLanguageModel] = useLocalStorage<LLMModelConfig>(
    'languageModel',
    {
      model: 'claude-opus-4-5-20251101',
    },
  )
  const [workflowMode, setWorkflowMode] = useLocalStorage<WorkflowMode | null>('workflowMode', null)
  const [appMode, setAppMode] = useLocalStorage<AppMode>('appMode', 'drawing')
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebarCollapsed', false)

  const posthog = usePostHog()

  const [messages, setMessages] = useState<Message[]>([])
  const [wireframe, setWireframe] = useState<DeepPartial<ExcalidrawSchema>>()
  const [currentTab, setCurrentTab] = useState<'code' | 'canvas'>('canvas')
  const [showSidebar, setShowSidebar] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const [authView, setAuthView] = useState<ViewType>('sign_in')
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { session, userTeam } = useAuth(setAuthDialog, setAuthView)

  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationIdState] = useState<string | null>(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const creatingConversationRef = useRef<Promise<string | null> | null>(null)
  const currentConversationIdRef = useRef<string | null>(null)

  // Wrapper to keep ref in sync with state
  const setCurrentConversationId = (id: string | null) => {
    currentConversationIdRef.current = id
    setCurrentConversationIdState(id)
  }

  const filteredModels = modelsList.models.filter((model) => {
    if (process.env.NEXT_PUBLIC_HIDE_LOCAL_MODELS) {
      return model.providerId !== 'ollama'
    }
    return true
  })

  const defaultModel = filteredModels.find(
    (model) => model.id === 'claude-opus-4-5-20251101',
  ) || filteredModels[0]

  const currentModel = filteredModels.find(
    (model) => model.id === languageModel.model,
  ) || defaultModel

  useEffect(() => {
    if (languageModel.model && !filteredModels.find((m) => m.id === languageModel.model)) {
      setLanguageModel({ ...languageModel, model: defaultModel.id })
    }
  }, [languageModel.model])

  // Load conversations on session change
  useEffect(() => {
    if (session) {
      loadConversations()
    } else {
      setConversations([])
      setCurrentConversationId(null)
    }
  }, [session?.user?.id])

  // API Functions
  async function loadConversations() {
    if (!session) return
    setIsLoadingConversations(true)
    try {
      const res = await fetch('/api/conversations', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      } else {
        console.error('Failed to load conversations:', res.status, await res.text())
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsLoadingConversations(false)
    }
  }

  async function createConversationInternal(title?: string): Promise<string | null> {
    if (!session) return null
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setConversations((prev) => [data.conversation, ...prev])
        return data.conversation.id
      } else {
        console.error('Failed to create conversation:', res.status, await res.text())
      }
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
    return null
  }

  // Prevent duplicate conversation creation with ref
  async function getOrCreateConversation(title?: string): Promise<string | null> {
    if (currentConversationId) return currentConversationId

    // If already creating, wait for that promise
    if (creatingConversationRef.current) {
      return creatingConversationRef.current
    }

    // Create new conversation
    creatingConversationRef.current = createConversationInternal(title).then((id) => {
      if (id) {
        setCurrentConversationId(id)
      }
      creatingConversationRef.current = null
      return id
    })

    return creatingConversationRef.current
  }

  async function loadConversation(id: string) {
    if (!session) return
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        const conv = data.conversation

        // Restore messages
        const restoredMessages: Message[] = conv.messages.map((msg: DBMessage) => ({
          role: msg.role,
          content: msg.content,
          object: msg.wireframe,
        }))
        setMessages(restoredMessages)

        // Restore wireframe
        if (conv.wireframe) {
          setWireframe(conv.wireframe)
        } else {
          setWireframe(undefined)
        }

        setCurrentConversationId(id)
      }
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }

  async function saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: MessageContent[],
    wireframeData?: DeepPartial<ExcalidrawSchema> | null
  ) {
    if (!session) return
    try {
      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, wireframe: wireframeData }),
        credentials: 'include',
      })
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  async function updateConversation(id: string, data: { title?: string; wireframe?: DeepPartial<ExcalidrawSchema> | null }) {
    if (!session) return
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
    } catch (error) {
      console.error('Failed to update conversation:', error)
    }
  }

  async function deleteConversation(id: string) {
    if (!session) return
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (currentConversationId === id) {
          handleClearChat()
          setCurrentConversationId(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const lastMessage = messages[messages.length - 1]

  const { object, submit, isLoading, stop, error } = useObject({
    api: '/api/chat',
    schema,
    onError: (error) => {
      console.error('Error submitting request:', error)
      if (error.message.includes('limit')) {
        setIsRateLimited(true)
      }
      setErrorMessage(error.message)
    },
    onFinish: async ({ object: wireframeResult, error }) => {
      if (!error && wireframeResult) {
        posthog.capture('wireframe_generated', {
          step: wireframeResult?.current_step,
          type: wireframeResult?.wireframe_type,
          update_mode: wireframeResult?.element_updates?.length ? 'partial' : 'full',
        })

        // 요소가 생성되거나 업데이트되면 Canvas 탭으로 전환
        const hasElements = wireframeResult?.excalidraw_elements && wireframeResult.excalidraw_elements.length > 0
        const hasUpdates = wireframeResult?.element_updates && wireframeResult.element_updates.length > 0
        if (hasElements || hasUpdates) {
          setCurrentTab('canvas')
        }

        // Save assistant message to DB (use ref to avoid stale closure)
        const convId = currentConversationIdRef.current
        console.log('[onFinish] Saving assistant message, convId:', convId)
        if (convId && session) {
          const content: MessageContent[] = [
            { type: 'text', text: wireframeResult.commentary || '' },
          ]
          await saveMessage(convId, 'assistant', content, wireframeResult)
          await updateConversation(convId, { wireframe: wireframeResult })
          console.log('[onFinish] Assistant message saved successfully')
        } else {
          console.log('[onFinish] Skipped saving - convId:', convId, 'session:', !!session)
        }
      }
    },
  })

  // 요소 병합 함수 (partial updates 처리)
  function mergeElementUpdates(
    currentElements: any[],
    updates: ElementUpdate[]
  ): any[] {
    const result = [...currentElements]

    for (const update of updates) {
      const idx = result.findIndex(el => el.id === update.element_id)

      switch (update.operation) {
        case 'update':
          if (idx !== -1 && update.changes) {
            result[idx] = { ...result[idx], ...update.changes }
          }
          break
        case 'delete':
          if (idx !== -1) {
            result.splice(idx, 1)
          }
          break
      }
    }

    return result
  }

  useEffect(() => {
    if (object) {
      // AI 응답 처리: partial updates 또는 full replacement
      setWireframe(prev => {
        let newElements: any[]

        // element_updates가 있으면 partial update 모드
        if (object.element_updates && object.element_updates.length > 0) {
          newElements = mergeElementUpdates(
            prev?.excalidraw_elements || [],
            object.element_updates as ElementUpdate[]
          )
        }
        // excalidraw_elements가 있으면 full replacement 모드
        else if (object.excalidraw_elements?.length) {
          newElements = object.excalidraw_elements
        }
        // 둘 다 없으면 기존 유지
        else {
          newElements = prev?.excalidraw_elements || []
        }

        return {
          ...object,
          excalidraw_elements: newElements
        }
      })

      // 메시지 콘텐츠 구성
      const content: Message['content'] = [
        { type: 'text', text: object.commentary || '' },
      ]

      // 입력 옵션이 있으면 표시
      if (object.awaiting_input && Array.isArray(object.input_options)) {
        const optionsText = object.input_options
          .map((opt, i) => `${i + 1}. ${opt}`)
          .join('\n')
        content.push({ type: 'text', text: `\n\n${object.input_prompt || '선택해주세요:'}\n${optionsText}` })
      }

      // 구조 계획이 있으면 코드로 표시
      if (object.structure_plan) {
        content.push({
          type: 'code',
          text: JSON.stringify(object.structure_plan, null, 2)
        })
      }

      if (!lastMessage || lastMessage.role !== 'assistant') {
        addMessage({
          role: 'assistant',
          content,
          object,
        })
      }

      if (lastMessage && lastMessage.role === 'assistant') {
        setMessage({
          content,
          object,
        })
      }
    }
  }, [object])

  useEffect(() => {
    if (error) stop()
  }, [error])

  // 사용자가 캔버스에서 그린 요소 캡처
  const handleElementsChange = useCallback((elements: any[]) => {
    setWireframe(prev => ({
      ...prev,
      excalidraw_elements: elements
    }))
  }, [])

  function setMessage(message: Partial<Message>, index?: number) {
    setMessages((previousMessages) => {
      const updatedMessages = [...previousMessages]
      updatedMessages[index ?? previousMessages.length - 1] = {
        ...previousMessages[index ?? previousMessages.length - 1],
        ...message,
      }
      return updatedMessages
    })
  }

  async function handleSubmitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!session) {
      return setAuthDialog(true)
    }

    if (isLoading) {
      stop()
    }

    // Generate title from first message (truncate to 50 chars)
    const title = chatInput.slice(0, 50) + (chatInput.length > 50 ? '...' : '')

    // Create conversation if not exists (with dedup)
    const convId = await getOrCreateConversation(title)

    const content: Message['content'] = [{ type: 'text', text: chatInput }]
    const images = await toMessageImage(files)

    if (images.length > 0) {
      images.forEach((image) => {
        content.push({ type: 'image', image })
      })
    }

    const updatedMessages = addMessage({
      role: 'user',
      content,
    })

    // Save user message to DB
    if (convId && session) {
      const dbContent: MessageContent[] = content.map(c => {
        if (c.type === 'text') return { type: 'text', text: c.text }
        if (c.type === 'image') return { type: 'image', image: c.image }
        return { type: 'text', text: '' }
      })
      await saveMessage(convId, 'user', dbContent)
    }

    const elementsToSend = wireframe?.excalidraw_elements || []

    // If this is the first message and no mode was explicitly selected via button,
    // treat it as free chat (null mode) instead of using stored workflowMode
    const effectiveMode = messages.length === 0 ? null : workflowMode

    submit({
      userID: session?.user?.id,
      teamID: userTeam?.id,
      messages: toAISDKMessages(updatedMessages),
      model: currentModel,
      config: languageModel,
      currentElements: elementsToSend,
      workflowMode: effectiveMode,
    })

    setChatInput('')
    setFiles([])

    posthog.capture('chat_submit', {
      model: languageModel.model,
    })
  }

  function retry() {
    submit({
      userID: session?.user?.id,
      teamID: userTeam?.id,
      messages: toAISDKMessages(messages),
      model: currentModel,
      config: languageModel,
      workflowMode,
      appMode,
    })
  }

  function addMessage(message: Message) {
    setMessages((previousMessages) => [...previousMessages, message])
    return [...messages, message]
  }

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value)
  }

  function handleFileChange(change: SetStateAction<File[]>) {
    setFiles(change)
  }

  function logout() {
    supabase
      ? supabase.auth.signOut()
      : console.warn('Supabase is not initialized')
  }

  function handleLanguageModelChange(e: LLMModelConfig) {
    setLanguageModel({ ...languageModel, ...e })
  }

  function handleSocialClick(target: 'github' | 'x' | 'discord') {
    if (target === 'github') {
      window.open('https://github.com/e2b-dev/fragments', '_blank')
    } else if (target === 'x') {
      window.open('https://x.com/e2b', '_blank')
    } else if (target === 'discord') {
      window.open('https://discord.gg/e2b', '_blank')
    }
    posthog.capture(`${target}_click`)
  }

  function handleClearChat() {
    stop()
    setChatInput('')
    setFiles([])
    setMessages([])
    setWireframe(undefined)
    setCurrentTab('code')
  }

  function handleNewConversation() {
    handleClearChat()
    setCurrentConversationId(null)
    setWorkflowMode(null)
  }

  function handleSelectConversation(id: string) {
    if (id !== currentConversationId) {
      loadConversation(id)
    }
  }

  function handleUndo() {
    setMessages((previousMessages) => [...previousMessages.slice(0, -2)])
    setWireframe(undefined)
  }

  // 옵션 버튼 클릭 핸들러
  async function handleOptionClick(option: string) {
    if (!session) {
      return setAuthDialog(true)
    }

    // Create conversation if not exists (with dedup)
    const title = option.slice(0, 50) + (option.length > 50 ? '...' : '')
    const convId = await getOrCreateConversation(title)

    const content: Message['content'] = [{ type: 'text', text: option }]
    const updatedMessages = addMessage({
      role: 'user',
      content,
    })

    // Save user message to DB
    if (convId && session) {
      await saveMessage(convId, 'user', [{ type: 'text', text: option }])
    }

    const elementsToSend = wireframe?.excalidraw_elements || []

    submit({
      userID: session?.user?.id,
      teamID: userTeam?.id,
      messages: toAISDKMessages(updatedMessages),
      model: currentModel,
      config: languageModel,
      currentElements: elementsToSend,
      workflowMode,
      appMode,
    })

    posthog.capture('option_click', {
      option,
      step: wireframe?.current_step,
    })
  }

  // 현재 단계와 옵션 추출
  const currentStep = wireframe?.current_step as WireframeStep | undefined
  const isAwaitingInput = wireframe?.awaiting_input
  const inputOptions = wireframe?.input_options

  // 워크플로우 시작 핸들러
  async function handleStartWorkflow(mode: WorkflowMode = 'guided') {
    if (!session) {
      return setAuthDialog(true)
    }

    const modeLabels: Record<WorkflowMode, string> = {
      expert: 'Expert Mode',
      guided: 'Guided Mode',
      auto: 'Auto Mode',
      chat: 'Free Chat'
    }

    const convId = await getOrCreateConversation(modeLabels[mode])
    setWorkflowMode(mode)

    const content: Message['content'] = [{ type: 'text', text: '와이어프레임을 만들고 싶어요' }]
    const updatedMessages = addMessage({
      role: 'user',
      content,
    })

    if (convId && session) {
      await saveMessage(convId, 'user', [{ type: 'text', text: '와이어프레임을 만들고 싶어요' }])
    }

    submit({
      userID: session?.user?.id,
      teamID: userTeam?.id,
      messages: toAISDKMessages(updatedMessages),
      model: currentModel,
      config: languageModel,
      currentElements: [],
      workflowMode: mode,
      appMode,
    })

    posthog.capture('workflow_started', { mode })
  }

  return (
    <main className="flex h-screen overflow-hidden">
      {supabase && (
        <AuthDialog
          open={isAuthDialogOpen}
          setOpen={setAuthDialog}
          view={authView}
          supabase={supabase}
        />
      )}

      {/* Conversation Sidebar (only when logged in) */}
      {session && (
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={deleteConversation}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          session={session}
          onLogout={logout}
        />
      )}

      <div className={`flex-1 grid w-full h-full overflow-hidden ${isFullscreen ? '' : showSidebar ? 'md:grid-cols-[3fr_7fr]' : 'md:grid-cols-1'}`}>
        {!isFullscreen && (
        <div
          className={`flex flex-col h-full w-full mx-auto px-4 col-span-1 overflow-hidden transition-all duration-300 ${showSidebar ? 'max-w-[800px]' : 'max-w-[1200px]'}`}
        >
          {/* Fixed Header */}
          <div className="flex-shrink-0">
            <NavBar
              session={session}
              showLogin={() => setAuthDialog(true)}
              signOut={logout}
              onSocialClick={handleSocialClick}
              onClear={handleClearChat}
              canClear={messages.length > 0}
              canUndo={messages.length > 1 && !isLoading}
              onUndo={handleUndo}
            />
            {/* Workflow Mode Indicator */}
            {workflowMode && messages.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                    {workflowMode === 'expert' ? 'Expert' :
                     workflowMode === 'auto' ? 'Auto' :
                     workflowMode === 'guided' ? 'Guided' : 'Workflow'}
                  </span>
                  <button
                    onClick={() => {
                      setWorkflowMode(null)
                      handleClearChat()
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    종료
                  </button>
                </div>
              </div>
            )}
            {/* Step Indicator (only in workflow mode) */}
            {workflowMode && currentStep && currentStep !== 'complete' && (
              <StepIndicator currentStep={currentStep} />
            )}
          </div>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-auto min-h-0">
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8 h-full">
              <div className="text-center space-y-2 flex flex-col items-center">
                <img
                  src="/vibeframe-text.png"
                  alt="VibeFrame"
                  className="h-10 w-auto dark:invert"
                />
                <p className="text-sm text-muted-foreground">
                  캔버스에 그리고 채팅으로 수정하세요
                </p>
              </div>
              <div className="flex flex-col gap-3 mt-6 w-full max-w-md">
                <div className="text-center mb-3">
                  <p className="text-lg font-semibold text-gray-900">시작 방법을 선택하세요</p>
                  <p className="text-sm text-gray-500 mt-1">셋 중 하나를 클릭하면 바로 시작됩니다</p>
                </div>
                
                <button
                  onClick={() => handleStartWorkflow('guided')}
                  className="group flex items-center gap-4 w-full p-4 bg-white border-2 border-gray-300 rounded-xl hover:border-black hover:bg-gray-50 hover:shadow-md transition-all text-left"
                >
                  <div className="flex-shrink-0 w-20 h-10 bg-white text-black border-2 border-gray-400 rounded-lg flex items-center justify-center text-sm font-semibold group-hover:border-black group-hover:bg-black group-hover:text-white transition-all">
                    Guided
                  </div>
                  <span className="text-gray-600 text-sm">질문에 답하면서 함께 만들어요</span>
                </button>

                <button
                  onClick={() => handleStartWorkflow('expert')}
                  className="group flex items-center gap-4 w-full p-4 bg-white border-2 border-gray-300 rounded-xl hover:border-black hover:bg-gray-50 hover:shadow-md transition-all text-left"
                >
                  <div className="flex-shrink-0 w-20 h-10 bg-white text-black border-2 border-gray-400 rounded-lg flex items-center justify-center text-sm font-semibold group-hover:border-black group-hover:bg-black group-hover:text-white transition-all">
                    Expert
                  </div>
                  <span className="text-gray-600 text-sm">모든 디테일을 직접 결정해요</span>
                </button>

                <button
                  onClick={() => handleStartWorkflow('auto')}
                  className="group flex items-center gap-4 w-full p-4 bg-white border-2 border-gray-300 rounded-xl hover:border-black hover:bg-gray-50 hover:shadow-md transition-all text-left"
                >
                  <div className="flex-shrink-0 w-20 h-10 bg-white text-black border-2 border-gray-400 rounded-lg flex items-center justify-center text-sm font-semibold group-hover:border-black group-hover:bg-black group-hover:text-white transition-all">
                    Auto
                  </div>
                  <span className="text-gray-600 text-sm">최소 입력, AI가 알아서 만들어요</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                또는 아래 채팅으로 자유롭게 요청하세요
              </p>
            </div>
          ) : (
            <Chat
              messages={messages}
              isLoading={isLoading}
              setCurrentPreview={() => {}}
            />
          )}
          </div>
          
          <div className="flex-shrink-0">
            {workflowMode && isAwaitingInput && inputOptions && inputOptions.length > 0 && !isLoading && (
              <div className="flex flex-wrap gap-2 px-2 py-3 border-t border-gray-100 bg-gray-50">
                {inputOptions.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleOptionClick(option as string)}
                    className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    {option as string}
                  </button>
                ))}
              </div>
            )}
            <ChatInput
            retry={retry}
            isErrored={error !== undefined}
            errorMessage={errorMessage}
            isLoading={isLoading}
            isRateLimited={isRateLimited}
            stop={stop}
            input={chatInput}
            handleInputChange={handleSaveInputChange}
            handleSubmit={handleSubmitAuth}
            isMultiModal={currentModel?.multiModal || false}
            files={files}
            handleFileChange={handleFileChange}
          >
            <ModePicker
              mode={appMode}
              onModeChange={setAppMode}
            />
          </ChatInput>
          </div>
        </div>
        )}
        {(showSidebar || isFullscreen) ? (
          <Preview
            selectedTab={currentTab}
            onSelectedTabChange={setCurrentTab}
            isChatLoading={isLoading}
            wireframe={wireframe}
            onClose={() => {
              if (isFullscreen) {
                setIsFullscreen(false)
              } else {
                setShowSidebar(false)
              }
            }}
            onElementsChange={handleElementsChange}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          />
        ) : (
          <button
            onClick={() => setShowSidebar(true)}
            className="fixed right-4 top-4 z-20 p-2 bg-popover border rounded-lg shadow-lg hover:bg-muted transition-colors"
            title="Open sidebar"
          >
            <ChevronsLeft className="h-5 w-5" />
          </button>
        )}
      </div>
    </main>
  )
}
