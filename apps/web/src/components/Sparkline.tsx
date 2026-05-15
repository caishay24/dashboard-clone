export function Sparkline({
  data,
  width = 720,
  height = 180,
  stroke = "#62d26f"
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  const clean = data.filter((value) => Number.isFinite(value));
  if (clean.length < 2) {
    return <div className="flex h-44 items-center justify-center text-sm text-app-muted">No chart data</div>;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);
  const path = clean
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * (height - 18) - 9;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible" role="img" aria-label="price sparkline">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
