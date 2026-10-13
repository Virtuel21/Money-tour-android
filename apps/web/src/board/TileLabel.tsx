import type { TileLabelAnchors } from './tileLabels';

let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
function textWidth(text: string, size: number, weight: number) {
  const key = `${weight}:${size}:${text}`;
  if (widths.has(key)) return widths.get(key)!;
  context ??= document.createElement('canvas').getContext('2d');
  if (context) context.font = `${weight} ${size}px Arial, sans-serif`;
  const width = context?.measureText(text).width ?? text.length * size;
  widths.set(key, width);
  return width;
}

export function TileLabel({
  id,
  name,
  rent,
  conditions,
  anchors,
  dimmed,
  insured = false,
}: {
  id: number;
  name: string;
  rent?: string;
  conditions: string[];
  anchors?: TileLabelAnchors;
  dimmed: boolean;
  insured?: boolean;
}) {
  if (!anchors) return null;
  const frame = (
    matrix: number[],
    height: number,
    kind: string,
    text: string,
    size: number,
    backing: boolean,
  ) => (
    <svg
      data-tile-label={id}
      data-label-kind={kind}
      className={`tile-face-label${dimmed ? ' label-dimmed' : ''}`}
      viewBox={`0 0 240 ${height}`}
      style={{ height, transform: `matrix(${matrix.join(',')})` }}
    >
      {backing && <rect width="240" height={height} rx="5" fill="#fff7df" fillOpacity="0.94" />}
      <svg
        x="8"
        y="2"
        width="224"
        height={height - 4}
        viewBox={`0 0 ${Math.max(224, textWidth(text, size, kind === 'rent' ? 900 : 700) + 8)} ${height - 4}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={size}
          fontWeight={kind === 'rent' ? 900 : 700}
        >
          {text}
        </text>
      </svg>
    </svg>
  );
  return (
    <>
      {frame(anchors.name, 60, 'name', name, 46, true)}
      {conditions.length > 0 &&
        frame(anchors.condition, 36, 'condition', conditions.join(' · '), 23, true)}
      {rent && frame(insured ? anchors.insuredRent : anchors.rent, 120, 'rent', rent, 116, false)}
    </>
  );
}
