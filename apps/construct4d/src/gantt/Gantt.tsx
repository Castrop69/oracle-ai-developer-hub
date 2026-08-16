import { useMemo, useRef, useState } from 'react';
import type { ProjectData, Task } from '../types';
import { taskProgressAt } from '../sim/status';

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface DragState {
  uid: number;
  mode: DragMode;
  originX: number;
  origStart: number;
  origFinish: number;
  moved: boolean;
}

const ROW_H = 22;
const BAR_H = 10;
const LABEL_W = 250;
const AXIS_H = 26;
const DAY_MS = 86400000;

// Chart palette (dark mode steps — see dataviz reference palette)
const C = {
  surface: '#1a1a19',
  grid: '#2c2c2a',
  baseline: '#383835',
  inkPrimary: '#ffffff',
  inkSecondary: '#c3c2b7',
  inkMuted: '#898781',
  bar: '#3987e5',
  barTrack: 'rgba(57,135,229,0.22)',
  milestone: '#d95926',
  cursor: '#e66767',
};

interface GanttProps {
  project: ProjectData;
  currentDate: Date;
  onScrub: (d: Date) => void;
  selectedTaskUids: Set<number>;
  onSelectTask: (uid: number | null) => void;
  editedUids: Set<number>;
  onEditTask: (uid: number, patch: { start: Date; finish: Date }) => void;
}

export function Gantt({
  project,
  currentDate,
  onScrub,
  selectedTaskUids,
  onSelectTask,
  editedUids,
  onEditTask,
}: GanttProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [hover, setHover] = useState<{ task: Task; x: number; y: number } | null>(null);

  const t0 = startOfDay(project.start).getTime() - 2 * DAY_MS;
  const t1 = startOfDay(project.finish).getTime() + 4 * DAY_MS;
  const days = Math.max(1, Math.round((t1 - t0) / DAY_MS));
  const pxPerDay = days > 500 ? 2 : days > 250 ? 3 : 4;
  const chartW = days * pxPerDay;
  const tasks = project.tasks;
  const chartH = tasks.length * ROW_H;

  const xOf = (d: Date) => ((d.getTime() - t0) / DAY_MS) * pxPerDay;
  const dateOf = (x: number) => new Date(t0 + (x / pxPerDay) * DAY_MS);

  const months = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    const d = new Date(t0);
    d.setDate(1);
    while (d.getTime() < t1) {
      if (d.getTime() >= t0) {
        out.push({
          x: xOf(d),
          label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        });
      }
      d.setMonth(d.getMonth() + 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t0, t1, pxPerDay]);

  const DAY_MS_L = 86400000;

  const beginDrag = (e: React.PointerEvent, task: Task, mode: DragMode) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      uid: task.uid,
      mode,
      originX: e.clientX,
      origStart: task.start.getTime(),
      origFinish: task.finish.getTime(),
      moved: false,
    };
    setHover(null);
  };

  const dragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const dayDelta = Math.round((e.clientX - d.originX) / pxPerDay) * DAY_MS_L;
    if (dayDelta !== 0) d.moved = true;
    let start = d.origStart;
    let finish = d.origFinish;
    if (d.mode === 'move') {
      start += dayDelta;
      finish += dayDelta;
    } else if (d.mode === 'resize-end') {
      finish = Math.max(start, finish + dayDelta);
    } else {
      start = Math.min(finish, start + dayDelta);
    }
    onEditTask(d.uid, { start: new Date(start), finish: new Date(finish) });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  const scrubFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const d = dateOf(Math.max(0, Math.min(chartW, x)));
    onScrub(new Date(Math.max(project.start.getTime(), Math.min(project.finish.getTime(), d.getTime()))));
  };

  const cursorX = xOf(currentDate);

  return (
    <div className="gantt-wrap">
      <div className="gantt-legend">
        <span className="lg-item"><span className="lg-swatch" style={{ background: C.barTrack, border: `1px solid ${C.bar}` }} /> Planned</span>
        <span className="lg-item"><span className="lg-swatch" style={{ background: C.bar }} /> Built to date</span>
        <span className="lg-item"><span className="lg-swatch lg-diamond" style={{ background: C.milestone }} /> Milestone</span>
        <span className="lg-item"><span className="lg-swatch" style={{ background: C.cursor, width: 3 }} /> Simulation date — drag to scrub</span>
        <span className="lg-item">Drag bars to reschedule · drag edges to stretch — the 3D updates live</span>
      </div>
      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-inner" style={{ width: LABEL_W + chartW }}>
          {/* Task labels */}
          <div className="gantt-labels" style={{ width: LABEL_W, paddingTop: AXIS_H }}>
            {tasks.map((t) => (
              <div
                key={t.uid}
                className={`gantt-label ${t.summary ? 'summary' : ''} ${
                  selectedTaskUids.has(t.uid) ? 'selected' : ''
                }`}
                style={{ height: ROW_H, paddingLeft: 8 + (t.outlineLevel - 1) * 14 }}
                title={`${t.name} — click to highlight in 3D`}
                onClick={() => onSelectTask(selectedTaskUids.has(t.uid) ? null : t.uid)}
              >
                {t.name}
              </div>
            ))}
          </div>
          {/* Chart */}
          <svg
            width={chartW}
            height={AXIS_H + chartH}
            style={{ display: 'block', background: C.surface, touchAction: 'none', cursor: 'col-resize' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrubFromEvent(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) scrubFromEvent(e);
            }}
          >
            {/* Month gridlines + axis labels */}
            {months.map((m, i) => (
              <g key={i}>
                <line x1={m.x} y1={AXIS_H} x2={m.x} y2={AXIS_H + chartH} stroke={C.grid} strokeWidth={1} />
                <text x={m.x + 4} y={17} fill={C.inkMuted} fontSize={11}>{m.label}</text>
              </g>
            ))}
            <line x1={0} y1={AXIS_H} x2={chartW} y2={AXIS_H} stroke={C.baseline} strokeWidth={1} />

            {/* Selected-row washes */}
            {tasks.map((t, i) =>
              selectedTaskUids.has(t.uid) ? (
                <rect
                  key={`sel-${t.uid}`}
                  x={0}
                  y={AXIS_H + i * ROW_H}
                  width={chartW}
                  height={ROW_H}
                  fill="rgba(57,135,229,0.12)"
                />
              ) : null,
            )}

            {/* Task bars */}
            {tasks.map((t, i) => {
              const y = AXIS_H + i * ROW_H;
              const x = xOf(t.start);
              const w = Math.max(2, xOf(t.finish) - x);
              const progress = taskProgressAt(t, currentDate);
              const handlers = {
                onPointerEnter: (e: React.PointerEvent) =>
                  setHover({ task: t, x: e.clientX, y: e.clientY }),
                onPointerLeave: () => setHover(null),
              };
              if (t.milestone) {
                const cx = x;
                const cy = y + ROW_H / 2;
                return (
                  <path
                    key={t.uid}
                    d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
                    fill={C.milestone}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => beginDrag(e, t, 'move')}
                    onPointerMove={dragMove}
                    onPointerUp={endDrag}
                    {...handlers}
                  />
                );
              }
              if (t.summary) {
                return (
                  <rect
                    key={t.uid}
                    x={x}
                    y={y + ROW_H / 2 - 2}
                    width={w}
                    height={4}
                    rx={2}
                    fill={C.inkSecondary}
                    opacity={0.55}
                    {...handlers}
                  />
                );
              }
              const edited = editedUids.has(t.uid);
              const by = y + (ROW_H - BAR_H) / 2;
              return (
                <g key={t.uid} {...handlers} onPointerMove={dragMove} onPointerUp={endDrag}>
                  <rect x={x} y={by} width={w} height={BAR_H} rx={4}
                    fill={C.barTrack} stroke={edited ? '#86b6ef' : C.bar}
                    strokeWidth={edited ? 1.5 : 0.75}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => beginDrag(e, t, 'move')} />
                  {progress > 0 && (
                    <rect x={x} y={by} width={Math.max(2, w * progress)}
                      height={BAR_H} rx={4} fill={C.bar} style={{ pointerEvents: 'none' }} />
                  )}
                  {/* resize handles */}
                  <rect x={x - 3} y={by - 2} width={7} height={BAR_H + 4} fill="transparent"
                    style={{ cursor: 'ew-resize' }}
                    onPointerDown={(e) => beginDrag(e, t, 'resize-start')} />
                  <rect x={x + w - 4} y={by - 2} width={7} height={BAR_H + 4} fill="transparent"
                    style={{ cursor: 'ew-resize' }}
                    onPointerDown={(e) => beginDrag(e, t, 'resize-end')} />
                </g>
              );
            })}

            {/* Simulation date cursor */}
            <line x1={cursorX} y1={0} x2={cursorX} y2={AXIS_H + chartH} stroke={C.cursor} strokeWidth={2} />
            <path d={`M ${cursorX - 5} 0 L ${cursorX + 5} 0 L ${cursorX} 8 Z`} fill={C.cursor} />
          </svg>
        </div>
      </div>
      {hover && (
        <div className="gantt-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="tt-title">{hover.task.name}</div>
          <div className="tt-row">
            {fmtDate(hover.task.start)} → {fmtDate(hover.task.finish)}
          </div>
          <div className="tt-row">
            {hover.task.milestone
              ? 'Milestone'
              : `${Math.round(taskProgressAt(hover.task, currentDate) * 100)}% built at sim date`}
          </div>
        </div>
      )}
    </div>
  );
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
