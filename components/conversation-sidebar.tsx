'use client'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Conversation } from '@/lib/types/conversation'
import { cn } from '@/lib/utils'
import {
  MessageSquarePlus,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  LogOut,
} from 'lucide-react'
import { Session } from '@supabase/supabase-js'
import Logo from '@/components/logo'
import { useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ConversationSidebarProps = {
  conversations: Conversation[]
  currentConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  session: Session | null
  onLogout: () => void
}

function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  const groups: { label: string; conversations: Conversation[] }[] = [
    { label: '오늘', conversations: [] },
    { label: '어제', conversations: [] },
    { label: '지난 7일', conversations: [] },
    { label: '이전', conversations: [] },
  ]

  conversations.forEach((conv) => {
    const date = new Date(conv.updated_at)
    if (date >= today) {
      groups[0].conversations.push(conv)
    } else if (date >= yesterday) {
      groups[1].conversations.push(conv)
    } else if (date >= lastWeek) {
      groups[2].conversations.push(conv)
    } else {
      groups[3].conversations.push(conv)
    }
  })

  return groups.filter((g) => g.conversations.length > 0)
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isCollapsed,
  onToggleCollapse,
  session,
  onLogout,
}: ConversationSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const groupedConversations = groupConversationsByDate(conversations)

  if (isCollapsed) {
    return (
      <div className="hidden md:flex w-12 h-screen bg-muted/50 border-r flex-col items-center py-3 gap-1 shrink-0">
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">사이드바 열기</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewConversation}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">새 대화</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1" />

        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <ThemeToggle />
            </TooltipTrigger>
            <TooltipContent side="right">테마 변경</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {session && (
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Avatar className="w-7 h-7 cursor-pointer">
                      <AvatarImage
                        src={
                          session.user.user_metadata?.avatar_url ||
                          'https://avatar.vercel.sh/' + session.user.email
                        }
                        alt={session.user.email}
                      />
                    </Avatar>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">내 계정</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent className="w-56" align="start" side="right">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm">내 계정</span>
                <span className="text-xs text-muted-foreground">
                  {session.user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  return (
    <div className="hidden md:flex w-52 h-screen bg-muted/50 border-r flex-col shrink-0">
      {/* Logo */}
      <div className="p-3 border-b">
        <Logo className="h-6" />
      </div>

      {/* Header */}
      <div className="p-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewConversation}
          className="flex-1 justify-start gap-2 h-8 text-sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          새 대화
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 text-muted-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            대화 기록이 없습니다
          </p>
        ) : (
          groupedConversations.map((group) => (
            <div key={group.label} className="mb-3">
              <h3 className="text-[11px] font-medium text-muted-foreground px-2 py-1.5">
                {group.label}
              </h3>
              {group.conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                    conv.id === currentConversationId
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                  onClick={() => onSelectConversation(conv.id)}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <span className="flex-1 text-xs truncate">{conv.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-transparent',
                      hoveredId !== conv.id && 'invisible'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteConversation(conv.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer - User & Theme */}
      {session && (
        <div className="p-2 border-t flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
                <Avatar className="w-6 h-6">
                  <AvatarImage
                    src={
                      session.user.user_metadata?.avatar_url ||
                      'https://avatar.vercel.sh/' + session.user.email
                    }
                    alt={session.user.email}
                  />
                </Avatar>
                <span className="text-xs truncate flex-1">{session.user.email}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start" side="top">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm">내 계정</span>
                <span className="text-xs text-muted-foreground">
                  {session.user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      )}
    </div>
  )
}
