import { useState, useRef, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ChatMessage, ConversationSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ModelSelect from '@/components/ModelSelect';
import ConversationList from '@/components/ConversationList';
import { MODELS, DEFAULT_MODEL_ID } from '@/lib/models';
import { toast } from 'sonner';
import { Loader2, SendHorizontal, Copy, Check, MessageSquare, History, Plus, Wand2 } from 'lucide-react';

const SUGGESTIONS = [
  'Help me brainstorm ideas for a post',
  'Explain this concept simply',
  'What questions should I be asking here?',
  'Give me feedback on this argument',
] as const;

/** Which conversation to reopen on the next visit. The messages live in MySQL. */
const ACTIVE_KEY = 'tumble_chat_active';
/** Written by the older localStorage-only history; cleaned up on mount. */
const LEGACY_KEY = 'tumble_chat_last';

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function rememberActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Unavailable storage (private mode) just costs us the reopen-on-reload.
  }
}

/**
 * Soft keyboards have no Shift+Enter, so Enter-to-send leaves no way to add a
 * line break. On touch devices Enter stays a plain newline and the button sends.
 */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export default function ChatPage() {
  const [touch] = useState(isTouchDevice);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [tokens, setTokens] = useState(0);
  const [styled, setStyled] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Load the history list, then reopen wherever the last visit left off.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }

      try {
        const list = await api.getConversations();
        if (cancelled) return;
        setConversations(list);

        const stored = readActiveId();
        if (stored && list.some(c => c.id === stored)) {
          await loadConversation(stored, { silent: true });
        } else if (stored) {
          rememberActiveId(null);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const loadConversation = async (id: string, opts?: { silent?: boolean }) => {
    setOpening(true);
    setHistoryOpen(false);
    try {
      const conv = await api.getConversation(id);
      setMessages(conv.messages);
      setActiveId(conv.id);
      setTokens(conv.input_tokens + conv.output_tokens);
      setStyled(conv.styled === 1);
      // A conversation may name a model that has since left the registry.
      if (conv.model && MODELS.some(m => m.id === conv.model)) setModel(conv.model);
      setInput('');
      rememberActiveId(conv.id);
    } catch (err) {
      // A conversation deleted elsewhere shouldn't strand us on a dead id.
      if (readActiveId() === id) rememberActiveId(null);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (!opts?.silent) toast.error(err instanceof ApiError ? err.message : 'Failed to open conversation');
    } finally {
      setOpening(false);
    }
  };

  /** Move the touched conversation to the top of the list, adding it if new. */
  const trackConversation = (
    id: string,
    title: string,
    messageCount: number,
    addedTokens: number,
    styleApplied: boolean
  ) => {
    setConversations(prev => {
      const existing = prev.find(c => c.id === id);
      const now = new Date().toISOString();
      const entry: ConversationSummary = existing
        ? {
            ...existing,
            model,
            styled: styleApplied ? 1 : 0,
            message_count: messageCount,
            output_tokens: existing.output_tokens + addedTokens,
            updated_at: now,
            updated_ts: Date.now() / 1000,
          }
        : {
            id,
            title,
            model,
            styled: styleApplied ? 1 : 0,
            input_tokens: 0,
            output_tokens: addedTokens,
            message_count: messageCount,
            created_at: now,
            updated_at: now,
            updated_ts: Date.now() / 1000,
          };
      return [entry, ...prev.filter(c => c.id !== id)];
    });
  };

  const send = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || loading) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const result = await api.chat(next, model, { conversationId: activeId ?? undefined, styled });
      setMessages([...next, { role: 'assistant', content: result.reply }]);
      const turnTokens = result.inputTokens + result.outputTokens;
      setTokens(t => t + turnTokens);

      if (styled && !result.styled) {
        toast.warning('No texts in your library yet — replied without your style');
      }

      if (result.conversationId) {
        setActiveId(result.conversationId);
        rememberActiveId(result.conversationId);
        trackConversation(result.conversationId, result.title ?? content, next.length + 1, turnTokens, result.styled);
      } else {
        toast.warning('Replied, but this conversation could not be saved');
      }
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

  const handleNew = () => {
    setMessages([]);
    setInput('');
    setTokens(0);
    setActiveId(null);
    setHistoryOpen(false);
    rememberActiveId(null);
  };

  const handleRename = async (id: string, title: string) => {
    const previous = conversations;
    setConversations(cs => cs.map(c => (c.id === id ? { ...c, title } : c)));
    try {
      await api.renameConversation(id, title);
    } catch (err) {
      setConversations(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to rename conversation');
    }
  };

  const handleDelete = async (id: string) => {
    const previous = conversations;
    setConversations(cs => cs.filter(c => c.id !== id));
    if (id === activeId) handleNew();
    try {
      await api.deleteConversation(id);
    } catch (err) {
      setConversations(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete conversation');
    }
  };

  const list = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      loading={listLoading}
      disabled={loading || opening}
      onSelect={loadConversation}
      onNew={handleNew}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6 h-[calc(100vh-3.5rem)]">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-input pr-4">
        {list}
      </aside>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-sm h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Conversations</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">{list}</div>
        </DialogContent>
      </Dialog>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {conversations.find(c => c.id === activeId)?.title ?? 'Chat'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {styled
                ? 'Replies are written in your voice, drawn from your library and preferences.'
                : 'A plain conversation — nothing here is rewritten in your style.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">
            {tokens > 0 && <Badge variant="outline">{tokens.toLocaleString()} tokens</Badge>}
            <Button
              variant={styled ? 'default' : 'outline'}
              size="sm"
              aria-pressed={styled}
              onClick={() => setStyled(v => !v)}
              disabled={loading}
              title={
                styled
                  ? "Replies are rewritten in your library's voice"
                  : 'Replies are plain — your style is not applied'
              }
              className="h-9 gap-1.5 px-2.5 text-xs"
            >
              <Wand2 className="h-3.5 w-3.5" />
              My style
            </Button>
            <ModelSelect value={model} onChange={setModel} disabled={loading} className="w-48" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              className="h-9 px-2 text-xs lg:hidden"
            >
              <History className="mr-1 h-3 w-3" />
              History
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleNew} className="h-9 px-2 text-xs lg:hidden">
                <Plus className="mr-1 h-3 w-3" />
                New
              </Button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto rounded-md border border-input bg-muted/30 p-3 sm:p-4 space-y-4"
        >
          {opening ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 && !loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
              <MessageSquare className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                {styled
                  ? 'Ask anything. Anything the model writes for you comes back in your own voice, learned from your library.'
                  : 'Ask anything. This is a direct conversation with the model — your library and style preferences are not applied here.'}
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
    </div>
  );
}
