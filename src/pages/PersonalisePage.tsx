import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function PersonalisePage() {
  const [preferences, setPreferences] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPreferences()
      .then(res => setPreferences(res.preferences))
      .catch(() => toast.error('Failed to load preferences'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      await api.savePreferences(preferences);
      toast.success('Preferences saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save preferences');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Personalise</h1>
        <p className="text-sm font-medium text-foreground mt-1">
          What personal preferences should the rewriter consider?
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your preferences will be included in every rewrite to guide tone, style, and voice.
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-h-[150px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preferences...
          </div>
        ) : (
          <Textarea
            value={preferences}
            onChange={e => setPreferences(e.target.value)}
            placeholder="e.g. Write in a casual, conversational tone. Avoid jargon. Use short sentences."
            className="min-h-[150px] resize-y text-sm"
          />
        )}
        <Button onClick={handleSave} disabled={loading}>Save preferences</Button>
      </div>
    </div>
  );
}
