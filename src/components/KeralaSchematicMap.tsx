import { useState } from 'react';
import type { DistrictPlan, DistrictPriority } from '../types';

interface KeralaSchematicMapProps {
  districts: DistrictPlan[];
  selectedDistrict: string | null;
  onSelectDistrict: (name: string | null) => void;
}

interface DistrictTile {
  name: string;
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Schematic north-to-south layout following Kerala's coastal-west / highland-east geography
const DISTRICT_TILES: DistrictTile[] = [
  { name: 'Kasaragod', code: 'KSD', x: 24, y: 16, w: 72, h: 42 },
  { name: 'Kannur', code: 'KNR', x: 46, y: 64, w: 74, h: 44 },
  { name: 'Wayanad', code: 'WYD', x: 126, y: 80, w: 68, h: 44 },
  { name: 'Kozhikode', code: 'KKD', x: 64, y: 114, w: 62, h: 46 },
  { name: 'Malappuram', code: 'MLP', x: 84, y: 166, w: 78, h: 46 },
  { name: 'Palakkad', code: 'PKD', x: 168, y: 174, w: 80, h: 56 },
  { name: 'Thrissur', code: 'TSR', x: 102, y: 218, w: 74, h: 48 },
  { name: 'Ernakulam', code: 'EKM', x: 116, y: 272, w: 72, h: 46 },
  { name: 'Idukki', code: 'IDK', x: 194, y: 258, w: 72, h: 68 },
  { name: 'Alappuzha', code: 'ALP', x: 104, y: 324, w: 50, h: 52 },
  { name: 'Kottayam', code: 'KTM', x: 158, y: 324, w: 56, h: 44 },
  { name: 'Pathanamthitta', code: 'PTA', x: 168, y: 374, w: 80, h: 42 },
  { name: 'Kollam', code: 'KLM', x: 132, y: 422, w: 78, h: 42 },
  { name: 'Thiruvananthapuram', code: 'TVM', x: 146, y: 470, w: 78, h: 44 },
];

const TILE_COLORS: Record<
  DistrictPriority,
  {
    fillClass: string;
    strokeClass: string;
    textClass: string;
    label: string;
  }
> = {
  high: {
    fillClass: 'fill-red-600 dark:fill-red-500',
    strokeClass: 'stroke-red-800 dark:stroke-red-300',
    textClass: 'fill-white dark:fill-slate-950',
    label: 'High priority',
  },
  medium: {
    fillClass: 'fill-amber-500 dark:fill-amber-400',
    strokeClass: 'stroke-amber-700 dark:stroke-amber-200',
    textClass: 'fill-slate-950',
    label: 'Medium priority',
  },
  low: {
    fillClass: 'fill-emerald-600 dark:fill-emerald-500',
    strokeClass: 'stroke-emerald-800 dark:stroke-emerald-200',
    textClass: 'fill-white dark:fill-slate-950',
    label: 'Low priority',
  },
  'no signal': {
    fillClass: 'fill-slate-200 dark:fill-slate-800',
    strokeClass: 'stroke-slate-400 dark:stroke-slate-600',
    textClass: 'fill-slate-800 dark:fill-slate-200',
    label: 'No signal',
  },
};

export function KeralaSchematicMap({
  districts,
  selectedDistrict,
  onSelectDistrict,
}: KeralaSchematicMapProps) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const byName = new Map(districts.map((d) => [d.name.toLowerCase(), d]));
  const activeName = hoveredName ?? selectedDistrict;
  const activeDistrict = activeName ? byName.get(activeName.toLowerCase()) ?? null : null;

  return (
    <aside
      aria-label="Schematic map of Kerala districts"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Kerala Schematic Map
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          North to South
        </span>
      </div>

      {/* Inline SVG Schematic Map */}
      <div className="flex justify-center rounded-lg border border-slate-100 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
        <svg
          viewBox="0 0 290 530"
          className="h-auto w-full max-w-[270px] select-none"
          role="img"
          aria-label="Schematic map of Kerala's 14 districts colored by relief priority"
        >
          {/* Compass / orientation cues */}
          <text
            x="266"
            y="24"
            textAnchor="end"
            className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500"
          >
            N ↑
          </text>
          <text
            x="14"
            y="265"
            textAnchor="middle"
            transform="rotate(-90 14 265)"
            className="fill-slate-400 font-mono text-[9px] dark:fill-slate-500"
          >
            ARABIAN SEA
          </text>

          {DISTRICT_TILES.map((tile) => {
            const match = byName.get(tile.name.toLowerCase());
            const priority: DistrictPriority = match?.priority ?? 'no signal';
            const style = TILE_COLORS[priority];
            const isActive = activeName?.toLowerCase() === tile.name.toLowerCase();
            const articleCount = match?.articleIds.length ?? 0;

            return (
              <g
                key={tile.name}
                role="button"
                tabIndex={0}
                aria-label={`${tile.name}: ${style.label}, ${articleCount} supporting articles`}
                className="cursor-pointer focus:outline-none"
                onMouseEnter={() => setHoveredName(tile.name)}
                onMouseLeave={() => setHoveredName(null)}
                onFocus={() => setHoveredName(tile.name)}
                onBlur={() => setHoveredName(null)}
                onClick={() =>
                  onSelectDistrict(
                    selectedDistrict?.toLowerCase() === tile.name.toLowerCase()
                      ? null
                      : tile.name
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDistrict(
                      selectedDistrict?.toLowerCase() === tile.name.toLowerCase()
                        ? null
                        : tile.name
                    );
                  }
                }}
              >
                <title>
                  {tile.name} — {style.label} ({articleCount} article{articleCount === 1 ? '' : 's'})
                </title>
                <rect
                  x={tile.x}
                  y={tile.y}
                  width={tile.w}
                  height={tile.h}
                  rx={7}
                  strokeWidth={isActive ? 2.5 : 1.25}
                  className={`${style.fillClass} ${style.strokeClass} transition-opacity duration-150 ${
                    activeName && !isActive ? 'opacity-75' : 'opacity-100'
                  }`}
                />
                <text
                  x={tile.x + tile.w / 2}
                  y={tile.y + tile.h / 2 + 4}
                  textAnchor="middle"
                  className={`${style.textClass} pointer-events-none font-mono text-[11px] font-semibold`}
                >
                  {tile.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover / Selection Readout */}
      <div className="mt-3 min-h-[54px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
        {activeDistrict ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-display font-semibold text-slate-900 dark:text-slate-100">
                {activeDistrict.name}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {TILE_COLORS[activeDistrict.priority].label} ·{' '}
                {activeDistrict.articleIds.length} article
                {activeDistrict.articleIds.length === 1 ? '' : 's'}
              </div>
            </div>
            {selectedDistrict && (
              <button
                type="button"
                onClick={() => onSelectDistrict(null)}
                className="rounded px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/60"
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Hover or click any district tile to inspect its priority or filter the list.
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-red-600 dark:bg-red-500" aria-hidden="true" />
          <span>High</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-amber-500 dark:bg-amber-400" aria-hidden="true" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-600 dark:bg-emerald-500" aria-hidden="true" />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-slate-400 bg-slate-200 dark:border-slate-600 dark:bg-slate-800" aria-hidden="true" />
          <span>No signal</span>
        </div>
      </div>
    </aside>
  );
}
