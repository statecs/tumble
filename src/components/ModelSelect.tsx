import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODELS } from '@/lib/models';
import { cn } from '@/lib/utils';

const GROUPS = [
  { provider: 'anthropic' as const, label: 'Anthropic' },
  { provider: 'openai' as const, label: 'OpenAI' },
];

export default function ModelSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('w-full sm:w-48', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GROUPS.map(group => (
          <SelectGroup key={group.provider}>
            <SelectLabel>{group.label}</SelectLabel>
            {MODELS.filter(m => m.provider === group.provider).map(m => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex items-center gap-2">
                  {m.label}
                  {m.gated && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1 py-px">
                      Limited
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
