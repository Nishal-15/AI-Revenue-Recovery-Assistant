/**
 * Semicircle gauge with tick marks: the filled arc shows a share from 0 to 1.
 * Purely visual; the number and label beside it carry the meaning for screen readers.
 */
const RADIUS = 80;
const CENTER_X = 100;
const CENTER_Y = 96;
const TICKS = 36;

const point = (angle: number, radius: number) => ({
  x: CENTER_X + radius * Math.cos(angle),
  y: CENTER_Y - radius * Math.sin(angle),
});

export const Gauge = ({ share }: { share: number }) => {
  const clamped = Math.min(Math.max(share, 0), 1);
  const end = point(Math.PI * (1 - clamped), RADIUS);
  const arc = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  const track = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;

  return (
    <svg viewBox="0 0 200 104" className="h-auto w-full max-w-64" aria-hidden>
      {Array.from({ length: TICKS + 1 }, (_, index) => {
        const angle = Math.PI * (1 - index / TICKS);
        const outer = point(angle, RADIUS + 16);
        const inner = point(angle, RADIUS + (index % 6 === 0 ? 8 : 11));
        return (
          <line
            key={index}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="currentColor"
            strokeOpacity={index / TICKS <= clamped ? 0.55 : 0.2}
            strokeWidth={1.2}
          />
        );
      })}
      <path d={track} fill="none" stroke="var(--color-rr-line-strong)" strokeWidth={9} strokeLinecap="round" opacity={0.55} />
      <path d={arc} fill="none" stroke="var(--color-rr-primary)" strokeWidth={9} strokeLinecap="round" />
      <circle cx={end.x} cy={end.y} r={5} fill="var(--color-rr-surface)" stroke="var(--color-rr-primary)" strokeWidth={3} />
    </svg>
  );
};
