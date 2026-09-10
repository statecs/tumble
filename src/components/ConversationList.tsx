import { useState } from 'react';
import type { ConversationSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Pencil, Trash2, Check, X, Wand2 } from 'lucide-react';

/** Takes epoch seconds: the datetime strings MySQL returns carry no timezone. */
function formatWhen(seconds: number): string {
  const ts = seconds * 1000;
  if (!Number.isFinite(ts)) return '';

  // Clamped at zero so a server clock running ahead never reads as the future.
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ConversationList({
  conversations,
  activeId,
  loading,
  disabled,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const startRename = (c: ConversationSummary) => {
    setConfirmId(null);
    setEditingId(c.id);
    setDraftTitle(c.title);
  };

  const commitRename = () => {
    const title = draftTitle.trim();
    if (editingId && title) onRename(editingId, title);
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onNew}
        disabled={disabled}
        className="w-full justify-start gap-2 shrink-0"
      >
        <Plus className="h-4 w-4" />
        New chat
      </Button>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-6 text-xs text-muted-foreground text-center">
            Past conversations show up here once you send a message.
          </p>
        ) : (
          conversations.map(c => {
            const active = c.id === activeId;

            if (editingId === c.id) {
              return (
                <div key={c.id} className="flex items-center gap-1 rounded-md border border-input p-1">
                  <Input
                    autoFocus
                    value={draftTitle}
                    onChange={e => setDraftTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="h-7 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button variant="ghost" size="sm" onClick={commitRename} className="h-6 w-6 p-0 shrink-0">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-6 w-6 p-0 shrink-0">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            }

            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => !disabled && onSelect(c.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) onSelect(c.id); }
                }}
                className={cn(
                  'group flex items-center gap-1 rounded-md border border-transparent px-2 py-1.5 cursor-pointer transition-colors',
                  'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-accent border-input',
                  disabled && 'cursor-default opacity-60'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm leading-tight">
                    {c.styled === 1 && (
                      <Wand2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Uses your style" />
                    )}
                    <span className="truncate">{c.title}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.message_count} {c.message_count === 1 ? 'message' : 'messages'}
                    {formatWhen(c.updated_ts) && ` · ${formatWhen(c.updated_ts)}`}
                  </p>
                </div>

                {confirmId === c.id ? (
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { onDelete(c.id); setConfirmId(null); }}
                      className="h-6 px-1.5 text-[11px] text-destructive"
                    >
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmId(null)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Rename conversation"
                      onClick={() => startRename(c)}
                      className="h-6 w-6 p-0 text-muted-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete conversation"
                      onClick={() => setConfirmId(c.id)}
                      className="h-6 w-6 p-0 text-muted-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
