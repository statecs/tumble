import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Wand2, Copy, Check, Highlighter } from 'lucide-react';
import type { JSX } from 'react';

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
  const [outputText, setOutputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [language, setLanguage] = useState<'English' | 'Swedish'>('English');
  const [stats, setStats] = useState<{
    inputTokens: number;
    outputTokens: number;
    examplesUsed: number;
  } | null>(null);
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  useEffect(() => {
    api.getTexts({ limit: 1 }).then(res => setLibraryCount(res.total)).catch(() => {});
  }, []);

  const handleRewrite = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setOutputText('');
    setShowDiff(false);
    setStats(null);
    try {
      const result = await api.rewrite(inputText, language);
      setOutputText(result.rewritten);
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

  const handleCopy = async () => {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputWordCount = inputText.trim().split(/\s+/).filter(Boolean).length;

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
            <span className="text-sm font-medium">Output</span>
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
        </div>
      </div>
    </div>
  );
}
