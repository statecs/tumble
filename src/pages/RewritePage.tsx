import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Wand2, Copy, Check, Highlighter, ChevronLeft, ChevronRight, SendHorizontal, CornerDownLeft } from 'lucide-react';
import type { JSX } from 'react';

const QUICK_CHIPS = [
  'Make shorter',
  'Make longer',
  'More formal',
  'More casual',
  'Add energy',
  'Simplify',
] as const;

function computeDiffTokens(inputText: string, outputText: string): JSX.Element[] {
  const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const inputSet = new Set(
    inputText.split(/\s+/).filter(Boolean).map(normalize)
  );
  return outputText.split(/(\s+)/).map((token, i) => {
    if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
    const isNew = !inputSet.has(normalize(token));
    return isNew
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 rounded-sm px-0.5">{token}</mark>
      : <span key={i}>{token}</span>;
  });
}

export default function RewritePage() {
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLabels, setHistoryLabels] = useState<string[]>([]);
  const [followUpText, setFollowUpText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [language, setLanguage] = useState<'English' | 'Swedish'>('English');
  const [model, setModel] = useState<'claude' | 'openai'>('claude');
  const [stats, setStats] = useState<{
    inputTokens: number;
    outputTokens: number;
    examplesUsed: number;
  } | null>(null);
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  const outputText = history[historyIndex] ?? '';

  useEffect(() => {
    api.getTexts({ limit: 1 }).then(res => setLibraryCount(res.total)).catch(() => {});
  }, []);

  const handleRewrite = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setHistory([]);
    setHistoryIndex(0);
    setHistoryLabels([]);
    setFollowUpText('');
    setShowDiff(false);
    setStats(null);
    try {
      const result = await api.rewrite(inputText, language, model);
      setHistory([result.rewritten]);
      setHistoryIndex(0);
      setHistoryLabels(['Original']);
      setStats({
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        examplesUsed: result.examplesUsed,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Rewrite failed');
    } finally {
      setLoading(false);
    }
  };

  const handleIterate = async (override?: string) => {
    const instruction = override ?? followUpText;
    if (!instruction.trim() || !outputText) return;
    setLoading(true);
    try {
      const result = await api.rewrite(inputText, language, model, {
        previousOutput: history[historyIndex],
        instruction,
      });
      setHistory(prev => [...prev.slice(0, historyIndex + 1), result.rewritten]);
      setHistoryIndex(prev => prev + 1);
      setHistoryLabels(prev => [...prev.slice(0, historyIndex + 1), instruction]);
      if (!override) setFollowUpText('');
      setStats({
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        examplesUsed: result.examplesUsed,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Refinement failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputWordCount = inputText.trim().split(/\s+/).filter(Boolean).length;
  const outputWordCount = outputText.trim().split(/\s+/).filter(Boolean).length;

  const handleUseAsInput = () => {
    if (!outputText) return;
    setInputText(outputText);
    setHistory([]);
    setHistoryIndex(0);
    setHistoryLabels([]);
    setFollowUpText('');
    setShowDiff(false);
    setStats(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Rewrite in My Style</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {libraryCount === null
              ? 'Loading library...'
              : libraryCount === 0
              ? 'Add texts to your library first to establish your style.'
              : `Style corpus: ${libraryCount} ${libraryCount === 1 ? 'text' : 'texts'} in your library`}
          </p>
        </div>
        {stats && (
          <div className="flex gap-2 flex-wrap justify-end shrink-0">
            <Badge variant="secondary">Based on {stats.examplesUsed} texts</Badge>
            <Badge variant="outline">{(stats.inputTokens + stats.outputTokens).toLocaleString()} tokens</Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input panel */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Input text</span>
            <span className="text-xs text-muted-foreground">
              {inputWordCount > 0 ? `${inputWordCount} words` : ''}
            </span>
          </div>
          <Textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Paste the text you want to rewrite in your voice..."
            className="min-h-[420px] resize-y text-sm"
          />
          <div className="flex gap-2">
            <Select value={language} onValueChange={(v) => setLanguage(v as 'English' | 'Swedish')}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="English">English</SelectItem>
                <SelectItem value="Swedish">Swedish</SelectItem>
              </SelectContent>
            </Select>
            <Select value={model} onValueChange={(v) => setModel(v as 'claude' | 'openai')}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">Claude Sonnet</SelectItem>
                <SelectItem value="openai">GPT</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleRewrite}
              disabled={loading || !inputText.trim() || libraryCount === 0}
              className="flex-1"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rewriting...</>
              ) : (
                <><Wand2 className="mr-2 h-4 w-4" /> Rewrite in my style</>
              )}
            </Button>
          </div>
        </div>

        {/* Output panel */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Output</span>
              {outputText && (
                <span className="text-xs text-muted-foreground">
                  {outputWordCount} words
                </span>
              )}
              {history.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryIndex(i => i - 1)}
                    disabled={historyIndex === 0}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {historyIndex + 1} / {history.length}
                    {historyLabels[historyIndex] ? ` · ${historyLabels[historyIndex]}` : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryIndex(i => i + 1)}
                    disabled={historyIndex === history.length - 1}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            {outputText && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiff(d => !d)}
                  className={`h-7 px-2 text-xs ${showDiff ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <Highlighter className="mr-1 h-3 w-3" />
                  Highlight changes
                </Button>
                <Button variant="ghost" size="sm" onClick={handleUseAsInput} className="h-7 px-2 text-xs">
                  <CornerDownLeft className="mr-1 h-3 w-3" />
                  Use as input
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 text-xs">
                  {copied ? <><Check className="mr-1 h-3 w-3" />Copied</> : <><Copy className="mr-1 h-3 w-3" />Copy</>}
                </Button>
              </div>
            )}
          </div>
          <div className="min-h-[420px] rounded-md border border-input bg-muted/30 p-3 text-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analyzing your style and rewriting...</p>
              </div>
            ) : outputText ? (
              showDiff ? (
                <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">
                  {computeDiffTokens(inputText, outputText)}
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{outputText}</p>
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                Your rewritten text will appear here.
              </p>
            )}
          </div>
          {history.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map(chip => (
                  <Button
                    key={chip}
                    variant="outline"
                    size="sm"
                    onClick={() => handleIterate(chip)}
                    disabled={loading}
                    className="h-7 px-2.5 text-xs rounded-full"
                  >
                    {chip}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={followUpText}
                  onChange={e => setFollowUpText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleIterate()}
                  placeholder="Refine: e.g. make it shorter, add more energy..."
                  disabled={loading}
                  className="text-sm"
                />
                <Button
                  onClick={() => handleIterate()}
                  disabled={loading || !followUpText.trim()}
                  size="sm"
                  className="shrink-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
