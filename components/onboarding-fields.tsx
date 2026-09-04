import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Shared between /configurar (edit an existing confeitaria's profile) and
// /cadastro (first-time signup) so both wizards look and behave the same.

export function StepHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="font-heading text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SetupInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          className={`h-11 rounded-xl ${icon ? 'pl-10' : ''}`}
        />
      </div>
    </div>
  );
}
