export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number | string;
  note?: string;
  tone?: 'accent' | 'amber' | 'danger' | 'info';
}) {
  const colour = tone
    ? { accent: 'var(--accent)', amber: 'var(--amber)', danger: 'var(--danger)', info: 'var(--info)' }[tone]
    : undefined;

  return (
    <div className="stat" style={colour ? ({ '--tone': colour } as React.CSSProperties) : undefined}>
      <div className="eyebrow">{label}</div>
      <div className="stat-value">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
