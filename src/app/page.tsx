'use client'

import { useState, useRef, useEffect } from 'react'
import { Citation, ChatMessage } from '@/types'

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    notion: 'bg-gray-100 text-gray-700 border-gray-200',
    confluence: 'bg-blue-50 text-blue-700 border-blue-200',
    slack: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  const icons: Record<string, string> = {
    notion: '📄',
    confluence: '📘',
    slack: '💬',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${styles[source] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
    >
      {icons[source] ?? '📎'} {source}
    </span>
  )
}

// ─── Citation card ────────────────────────────────────────────────────────────

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
        Sources
      </p>
      <div className="flex flex-col gap-1.5">
        {citations.map((c) => (
          <a
            key={c.index}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 group"
          >
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-mono text-[10px]">
              {c.index}
            </span>
            <span className="flex-1 truncate group-hover:underline">{c.title}</span>
            <SourceBadge source={c.source} />
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  citations,
}: {
  message: MessageWithCitations
  citations?: Citation[]
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">
          K
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-sm'
        }`}
      >
        {/* Render markdown-like content */}
        <div
          className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2"
          dangerouslySetInnerHTML={{
            __html: formatMarkdown(message.content),
          }}
        />
        {!isUser && citations && <CitationList citations={citations} />}
        {!isUser && <FeedbackButtons queryId={message.queryId} />}
      </div>
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1">
        K
      </div>
      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Source filter toggle ─────────────────────────────────────────────────────

type Source = 'notion' | 'confluence' | 'slack'

function SourceFilter({
  active,
  onChange,
}: {
  active: Source[]
  onChange: (s: Source[]) => void
}) {
  const sources: Source[] = ['notion', 'confluence', 'slack']

  function toggle(s: Source) {
    onChange(
      active.includes(s) ? active.filter((x) => x !== s) : [...active, s]
    )
  }

  return (
    <div className="flex gap-2 mb-4">
      {sources.map((s) => (
        <button
          key={s}
          onClick={() => toggle(s)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            active.includes(s)
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          <SourceBadge source={s} />
        </button>
      ))}
    </div>
  )
}

// ─── Simple markdown formatter ────────────────────────────────────────────────

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-lg mt-4 mb-2">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\[(\d+)\]/g, '<sup class="text-indigo-500 font-medium cursor-pointer">[$1]</sup>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')
}

// ─── Suggested questions ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What is our onboarding process for new engineers?',
  'What is the vacation and PTO policy?',
  'How do I request access to production systems?',
  'What were the key decisions from last sprint?',
]

// ─── Feedback buttons ─────────────────────────────────────────────────────────

function FeedbackButtons({
  queryId,
  onFeedback,
}: {
  queryId?: string
  onFeedback?: (thumbsUp: boolean) => void
}) {
  const [sent, setSent] = useState<boolean | null>(null)

  if (!queryId) return null

  async function sendFeedback(thumbsUp: boolean) {
    setSent(thumbsUp)
    onFeedback?.(thumbsUp)
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryId, thumbsUp }),
    })
  }

  if (sent !== null) {
    return (
      <p className="text-xs text-gray-300 mt-2">
        {sent ? '👍 Thanks for the feedback' : '👎 Got it, we\'ll improve'}
      </p>
    )
  }

  return (
    <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
      <button
        onClick={() => sendFeedback(true)}
        className="text-xs text-gray-300 hover:text-green-500 transition-colors"
      >
        👍 Helpful
      </button>
      <button
        onClick={() => sendFeedback(false)}
        className="text-xs text-gray-300 hover:text-red-400 transition-colors"
      >
        👎 Not helpful
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface MessageWithCitations extends ChatMessage {
  citations?: Citation[]
  queryId?: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<MessageWithCitations[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeSources, setActiveSources] = useState<Source[]>([
    'notion', 'confluence', 'slack',
  ])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function sendMessage(query: string) {
    if (!query.trim() || isLoading) return

    const userMessage: MessageWithCitations = { role: 'user', content: query }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Build history for context (exclude citations from history)
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          history,
          sourceFilter: activeSources,
        }),
      })

      if (!res.ok) throw new Error('Request failed')

      // Extract citations from headers immediately
      const rawCitations = res.headers.get('X-Citations')
      const citations: Citation[] = rawCitations
        ? JSON.parse(rawCitations)
        : []

      const rawQueryId = res.headers.get('X-Query-Id')

      // Stream the response body
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      // Add empty assistant message that we'll fill as tokens stream in
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', citations, queryId: rawQueryId ?? undefined },
      ])

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse Vercel AI SDK data stream format: "0:\"token\"\n"
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const token = JSON.parse(line.slice(2))
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + token,
                  }
                }
                return updated
              })
            } catch {}
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
            K
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">
              Knowledge Base
            </h1>
            <p className="text-xs text-gray-400">
              Notion · Confluence · Slack
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-gray-400">Connected</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl mx-auto mb-4">
                🧠
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                Ask anything about your company
              </h2>
              <p className="text-sm text-gray-400">
                Searches across Notion, Confluence, and Slack simultaneously
              </p>
            </div>

            <SourceFilter active={activeSources} onChange={setActiveSources} />

            <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <SourceFilter active={activeSources} onChange={setActiveSources} />
            </div>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                citations={msg.citations}
              />
            ))}
            {isLoading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your company..."
              disabled={isLoading}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm text-gray-900 placeholder:text-gray-400 disabled:opacity-50 bg-gray-50 transition-all"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-300">
              ↵
            </span>
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              '→'
            )}
          </button>
        </div>
        <p className="text-center text-xs text-gray-300 mt-2">
          Answers are generated from your indexed knowledge base only
        </p>
      </div>
    </div>
  )
}