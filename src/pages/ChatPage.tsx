import { useState, useRef, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ChatMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import ModelSelect from '@/components/ModelSelect';
import { DEFAULT_MODEL_ID } from '@/lib/models';
import { toast } from 'sonner';
import { Loader2, SendHorizontal, Copy, Check, Trash2, MessageSquare, History } from 'lucide-react';

const SUGGESTIONS = [
  'Help me brainstorm ideas for a post',
  'Explain this concept simply',
  'What questions should I be asking here?',
  'Give me feedback on this argument',
] as const;

const STORAGE_KEY = 'tumble_chat_last';

interface StoredChat {
  messages: ChatMessage[];
  model: string;
  tokens: number;
  updatedAt: number;
}

/** The last conversation, or null when there is none / storage is unavailable. */
function loadChat(): StoredChat | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChat;
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatSaved(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Soft keyboards have no Shift+Enter, so Enter-to-send leaves no way to add a
 * line break. On touch devices Enter stays a plain newline and the button sends.
 */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export default function ChatPage() {
  const [restored] = useState(loadChat);
  const [touch] = useState(isTouchDevice);
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string>(restored?.model ?? DEFAULT_MODEL_ID);
  const [tokens, setTokens] = useState(restored?.tokens ?? 0);
  const [restoredAt, setRestoredAt] = useState<number | null>(restored?.updatedAt ?? null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Keep the last conversation around across reloads.
  useEffect(() => {
    try {
      if (messages.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const stored: StoredChat = { messages, model, tokens, updatedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Full or unavailable storage (private mode) — the chat just won't persist.
    }
  }, [messages, model, tokens]);

  const send = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || loading) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setRestoredAt(null);
    setLoading(true);

    try {
      const result = await api.chat(next, model);
      setMessages([...next, { role: 'assistant', content: result.reply }]);
      setTokens(t => t + result.inputTokens + result.outputTokens);
    } catch (err) {
      // Drop the unanswered user turn back into the composer so it isn't lost.
      setMessages(messages);
      setInput(content);
      toast.error(err instanceof ApiError ? err.message : 'Chat failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClear = () => {
    setMessages([]);
    setInput('');
    setTokens(0);
    setRestoredAt(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold">Chat</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A plain conversation — nothing here is rewritten in your style.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">
          {restoredAt !== null && (
            <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
              <History className="h-3 w-3" />
              Last conversation · {formatSaved(restoredAt)}
            </Badge>
          )}
          {tokens > 0 && <Badge variant="outline">{tokens.toLocaleString()} tokens</Badge>}
          <ModelSelect value={model} onChange={setModel} disabled={loading} className="w-48" />
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="h-9 px-2 text-xs">
              <Trash2 className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-md border border-input bg-muted/30 p-3 sm:p-4 space-y-4"
      >
        {messages.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
            <MessageSquare className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Ask anything. This is a direct conversation with the model — your library and style
              preferences are not applied here.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {SUGGESTIONS.map(s => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => send(s)}
                  className="h-7 px-2.5 text-xs rounded-full"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed'
                    : 'max-w-[95%] group'
                }
              >
                {m.role === 'assistant' ? (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                      {m.content}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(m.content, i)}
                      className="mt-1 h-6 px-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      {copiedIndex === i
                        ? <><Check className="mr-1 h-3 w-3" />Copied</>
                        : <><Copy className="mr-1 h-3 w-3" />Copy</>}
                    </Button>
                  </>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !touch) {
              e.preventDefault();
              send();
            }
          }}
          enterKeyHint={touch ? 'enter' : 'send'}
          placeholder={
            touch
              ? 'Send a message... (Return adds a new line)'
              : 'Send a message... (Enter to send, Shift+Enter for a new line)'
          }
          className="min-h-[52px] max-h-40 resize-y text-sm"
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} className="shrink-0 h-[52px]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
