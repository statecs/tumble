import { useState, useEffect, useCallback } from 'react';
import { api, Text, Category, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Edit2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  'blog-post':       'bg-indigo-100 text-indigo-800',
  'email':           'bg-sky-100 text-sky-800',
  'social-media':    'bg-pink-100 text-pink-800',
  'technical-doc':   'bg-emerald-100 text-emerald-800',
  'personal-note':   'bg-amber-100 text-amber-800',
  'presentation':    'bg-violet-100 text-violet-800',
  'marketing-copy':  'bg-red-100 text-red-800',
  'other':           'bg-gray-100 text-gray-800',
};

function CategoryBadge({ name }: { name: string }) {
  const cls = CATEGORY_COLORS[name] || CATEGORY_COLORS['other'];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {name}
    </span>
  );
}

export default function LibraryPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [manualTags, setManualTags] = useState('');
  const [uploading, setUploading] = useState(false);

  const [texts, setTexts] = useState<Text[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);

  const [selectedText, setSelectedText] = useState<Text | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTexts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTexts({
        page,
        limit: 20,
        category: categoryFilter || undefined,
        search: search || undefined,
      });
      setTexts(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error('Failed to load texts');
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, search]);

  useEffect(() => { fetchTexts(); }, [fetchTexts]);
  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setUploading(true);
    try {
      const newText = await api.createText({ title, content, manualTags: manualTags || undefined });
      toast.success(`Added — categorized as "${newText.categories[0]?.name || 'other'}"`);
      setTitle('');
      setContent('');
      setManualTags('');
      setPage(1);
      fetchTexts();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteText(id);
      toast.success('Text deleted');
      setSelectedText(null);
      fetchTexts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const openEdit = (text: Text) => {
    setEditTitle(text.title);
    setEditContent(text.content);
    setEditTags(text.tags.map(t => t.name).join(', '));
    setEditing(true);
  };

  const handleSave = async () => {
    if (!selectedText) return;
    setSaving(true);
    try {
      const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
      const updated = await api.updateText(selectedText.id, {
        title: editTitle,
        content: editContent,
        tags,
      });
      toast.success('Saved');
      setSelectedText(updated);
      setEditing(false);
      fetchTexts();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Upload Form */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card p-5 space-y-4 sticky top-6">
            <h2 className="font-semibold text-base">Add Text</h2>
            <form onSubmit={handleUpload} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Title of the text"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Paste your text here..."
                  className="min-h-[220px] resize-y"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags <span className="text-muted-foreground font-normal">(optional, comma-separated)</span></Label>
                <Input
                  id="tags"
                  value={manualTags}
                  onChange={e => setManualTags(e.target.value)}
                  placeholder="e.g. technical, 2024, work"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={uploading || !title.trim() || !content.trim()}
              >
                {uploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <><Plus className="mr-2 h-4 w-4" /> Add to Library</>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Library */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">
              Library{' '}
              {total > 0 && (
                <span className="text-muted-foreground font-normal text-sm">({total} texts)</span>
              )}
            </h2>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search..."
                className="flex-1"
              />
              <Button type="submit" variant="outline" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </form>
            <Select
              value={categoryFilter || 'all'}
              onValueChange={v => { setCategoryFilter(v === 'all' ? '' : v); setPage(1); }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Text list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : texts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search || categoryFilter
                ? 'No texts match your filters.'
                : 'No texts yet. Add your first text on the left.'}
            </div>
          ) : (
            <div className="space-y-2">
              {texts.map(text => (
                <button
                  key={text.id}
                  onClick={() => { setSelectedText(text); setEditing(false); }}
                  className="w-full text-left rounded-lg border bg-card hover:bg-accent/50 transition-colors p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm line-clamp-1">{text.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {text.word_count.toLocaleString()} words
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {text.categories.map(c => (
                      <CategoryBadge key={c.id} name={c.name} />
                    ))}
                    {text.tags.slice(0, 4).map(t => (
                      <span key={t.id} className="text-xs text-muted-foreground">#{t.name}</span>
                    ))}
                    {text.tags.length > 4 && (
                      <span className="text-xs text-muted-foreground">+{text.tags.length - 4}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{text.content}</p>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(p => p - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Text Detail Dialog */}
      <Dialog open={!!selectedText} onOpenChange={open => { if (!open) { setSelectedText(null); setEditing(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          {selectedText && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editing ? (
                    <Input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="font-semibold"
                    />
                  ) : (
                    selectedText.title
                  )}
                </DialogTitle>
                {!editing && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedText.categories.map(c => <CategoryBadge key={c.id} name={c.name} />)}
                    {selectedText.tags.map(t => (
                      <Badge key={t.id} variant="secondary" className="text-xs">#{t.name}</Badge>
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">
                      {selectedText.word_count.toLocaleString()} words
                    </span>
                  </div>
                )}
              </DialogHeader>

              <div className="flex-1 overflow-y-auto">
                {editing ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="min-h-[300px] resize-y text-sm"
                    />
                    <div className="space-y-1.5">
                      <Label>Tags <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
                      <Input
                        value={editTags}
                        onChange={e => setEditTags(e.target.value)}
                        placeholder="tag1, tag2, ..."
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap text-foreground/90">
                    {selectedText.content}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 pt-2">
                {editing ? (
                  <>
                    <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(selectedText.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(selectedText)}>
                      <Edit2 className="mr-2 h-4 w-4" /> Edit
                    </Button>
                    <DialogClose asChild>
                      <Button size="sm">Close</Button>
                    </DialogClose>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
