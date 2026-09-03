import { useState, useRef, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ChatMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, SendHorizontal, Copy, Check, Trash2, MessageSquare } from 'lucide-react';

const SUGGESTIONS = [
  'Help me brainstorm ideas for a post',
  'Explain this concept simply',
  'What questions should I be asking here?',
  'Give me feedback on this argument',
] as const;

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<'claude' | 'openai' | 'fable'>('claude');
  const [tokens, setTokens] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || loading) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
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
          {tokens > 0 && <Badge variant="outline">{tokens.toLocaleString()} tokens</Badge>}
          <Select value={model} onValueChange={(v) => setModel(v as 'claude' | 'openai' | 'fable')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude Sonnet</SelectItem>
              <SelectItem value="fable">Claude Fable 5</SelectItem>
              <SelectItem value="openai">GPT</SelectItem>
            </SelectContent>
          </Select>
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Send a message... (Enter to send, Shift+Enter for a new line)"
          className="min-h-[52px] max-h-40 resize-y text-sm"
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} className="shrink-0 h-[52px]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
