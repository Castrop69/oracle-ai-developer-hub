import type { ProjectData } from '../types';

interface TimelineProps {
  project: ProjectData;
  currentDate: Date;
  playing: boolean;
  speed: number; // simulated days per real second
  onTogglePlay: () => void;
  onSpeedChange: (s: number) => void;
  onScrub: (d: Date) => void;
  onReset: () => void;
}

const SPEEDS = [1, 3, 7, 14, 30];

export function Timeline({
  project,
  currentDate,
  playing,
  speed,
  onTogglePlay,
  onSpeedChange,
  onScrub,
  onReset,
}: TimelineProps) {
  const t0 = project.start.getTime();
  const t1 = project.finish.getTime();
  const frac = t1 > t0 ? (currentDate.getTime() - t0) / (t1 - t0) : 0;

  return (
    <div className="timeline">
      <button className="btn play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button className="btn" onClick={onReset} title="Back to project start">⏮</button>
      <select
        className="speed"
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))}
        title="Playback speed"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s} day{s > 1 ? 's' : ''}/sec
          </option>
        ))}
      </select>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={1000}
        value={Math.round(frac * 1000)}
        onChange={(e) => onScrub(new Date(t0 + (Number(e.target.value) / 1000) * (t1 - t0)))}
      />
      <span className="sim-date">
        {currentDate.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </span>
    </div>
  );
}
