import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Viewer } from './viewer/Viewer';
import { Gantt } from './gantt/Gantt';
import { Timeline } from './controls/Timeline';
import { DrawingsPanel } from './drawings/DrawingsPanel';
import { useProjectFile } from './msp/useProjectFile';
import { generateModelFromSchedule } from './model/generateModelFromSchedule';
import { autoMap, categorizeTask } from './mapping/autoMap';
import type { BuildingModel, Mapping, ProjectData } from './types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './types';
import sampleScheduleXml from '../public/samples/sample-schedule.xml?raw';

const DRAWING_MODEL_KEY = 'construct4d.drawingModel';

type Selection = { type: 'task'; uid: number } | { type: 'element'; id: string } | null;

export default function App() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(7);
  const [showGhost, setShowGhost] = useState(true);
  const [varianceMode, setVarianceMode] = useState(false);
  const [xray, setXray] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [drawingModel, setDrawingModel] = useState<BuildingModel | null>(() => {
    try {
      const raw = localStorage.getItem(DRAWING_MODEL_KEY);
      return raw ? (JSON.parse(raw) as BuildingModel) : null;
    } catch {
      return null;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const onProjectLoaded = useCallback((p: ProjectData) => {
    setCurrentDate((prev) => {
      // Keep the scrub position on re-sync; jump to start on first load.
      if (prev >= p.start && prev <= p.finish) return prev;
      return p.start;
    });
  }, []);

  const projectFile = useProjectFile(onProjectLoaded);
  const { project } = projectFile;

  const model: BuildingModel | null = useMemo(() => {
    if (drawingModel) return drawingModel;
    if (project) return generateModelFromSchedule(project.tasks);
    return null;
  }, [project, drawingModel]);

  const mapping: Mapping = useMemo(() => {
    if (!project || !model) return {};
    return autoMap(project.tasks, model.elements);
  }, [project, model]);

  // Reverse index: task UID -> element ids it drives
  const elementsByTask = useMemo(() => {
    const rev = new Map<number, string[]>();
    for (const [elId, uids] of Object.entries(mapping)) {
      for (const uid of uids) {
        const list = rev.get(uid) ?? [];
        list.push(elId);
        rev.set(uid, list);
      }
    }
    return rev;
  }, [mapping]);

  // Leaf tasks that never matched a trade — they won't animate anything
  const unlinkedTasks = useMemo(() => {
    if (!project) return [];
    return project.tasks.filter((t) => !t.summary && !t.milestone && categorizeTask(t.name) === null);
  }, [project]);

  const selectedElementIds = useMemo(() => {
    if (!selection) return new Set<string>();
    if (selection.type === 'element') return new Set([selection.id]);
    return new Set(elementsByTask.get(selection.uid) ?? []);
  }, [selection, elementsByTask]);

  const selectedTaskUids = useMemo(() => {
    if (!selection) return new Set<number>();
    if (selection.type === 'task') return new Set([selection.uid]);
    return new Set(mapping[selection.id] ?? []);
  }, [selection, mapping]);

  const setDrawingModelPersisted = useCallback((m: BuildingModel | null) => {
    setDrawingModel(m);
    setSelection(null);
    try {
      if (m) localStorage.setItem(DRAWING_MODEL_KEY, JSON.stringify(m));
      else localStorage.removeItem(DRAWING_MODEL_KEY);
    } catch {
      // Very large models can exceed the storage quota; the session still works.
    }
  }, []);

  // Playback loop
  const playRef = useRef({ playing, speed });
  playRef.current = { playing, speed };
  useEffect(() => {
    if (!playing || !project) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentDate((d) => {
        const next = new Date(d.getTime() + playRef.current.speed * 86400000 * dt);
        if (next >= project.finish) {
          setPlaying(false);
          return project.finish;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, project]);

  // Keyboard: space = play/pause, arrows = step ±1 day (shift: ±7), Esc = clear selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      if (!project) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        const days = (e.shiftKey ? 7 : 1) * (e.code === 'ArrowRight' ? 1 : -1);
        setCurrentDate((d) => {
          const next = d.getTime() + days * 86400000;
          return new Date(Math.max(project.start.getTime(), Math.min(project.finish.getTime(), next)));
        });
      } else if (e.code === 'Escape') {
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project]);

  const loadSample = () => {
    projectFile.importText(sampleScheduleXml);
  };

  const linkedCount = Object.keys(mapping).length;
  const taskByUid = useMemo(() => new Map((project?.tasks ?? []).map((t) => [t.uid, t])), [project]);

  const selectionInfo = useMemo(() => {
    if (!selection || !model) return null;
    if (selection.type === 'element') {
      const el = model.elements.find((e) => e.id === selection.id);
      if (!el) return null;
      return {
        title: el.name,
        subtitle: `${CATEGORY_LABELS[el.category]}${el.level ? ` · Level ${el.level}` : ''}`,
        items: (mapping[el.id] ?? []).map((uid) => taskByUid.get(uid)?.name).filter(Boolean) as string[],
        itemsLabel: 'Driven by',
      };
    }
    const task = taskByUid.get(selection.uid);
    if (!task) return null;
    const elIds = elementsByTask.get(selection.uid) ?? [];
    return {
      title: task.name,
      subtitle: `${task.start.toLocaleDateString()} → ${task.finish.toLocaleDateString()} · ${task.percentComplete}% recorded`,
      items: [`${elIds.length} model element${elIds.length !== 1 ? 's' : ''} highlighted in 3D`],
      itemsLabel: 'Builds',
    };
  }, [selection, model, mapping, taskByUid, elementsByTask]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">4D</span> Construct4D
          {project && <span className="project-name"> — {project.name}</span>}
        </div>
        <div className="topbar-actions">
          {projectFile.watching ? (
            <span className="watch-pill" title="Re-save the XML from Microsoft Project and the model updates automatically">
              ● Live-syncing {projectFile.watchedFileName}
              {projectFile.lastSync && ` (${projectFile.lastSync.toLocaleTimeString()})`}
              <button className="btn tiny" onClick={projectFile.stopWatching}>stop</button>
            </span>
          ) : (
            <>
              {projectFile.supportsWatch && (
                <button className="btn" onClick={projectFile.openAndWatch} title="Pick the XML you save from MS Project; edits re-sync automatically">
                  Open MS Project XML (live sync)
                </button>
              )}
              <label className="btn">
                Import XML
                <input
                  type="file"
                  accept=".xml"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && projectFile.importFile(e.target.files[0])}
                />
              </label>
              <button className="btn" onClick={loadSample}>Load sample project</button>
            </>
          )}
          <button className="btn" onClick={() => setSidebarOpen((s) => !s)}>
            {sidebarOpen ? 'Hide panel' : 'Show panel'}
          </button>
        </div>
      </header>

      {projectFile.error && <div className="error-bar">{projectFile.error}</div>}

      {!project ? (
        <div className="empty-state">
          <h1>4D construction scheduling, linked live to Microsoft Project</h1>
          <ol>
            <li>In Microsoft Project: <em>File → Save As → XML Format (*.xml)</em>.</li>
            <li>
              Here: <strong>Open MS Project XML (live sync)</strong> and pick that file. Every time
              you re-save it from Project, the 4D animation, Gantt, and model update automatically.
            </li>
            <li>
              Optionally drop your construction drawings in the side panel — Claude interprets the
              sheets and rebuilds the 3D model to match the real building.
            </li>
          </ol>
          <button className="btn primary big" onClick={loadSample}>
            Try it with the sample project
          </button>
        </div>
      ) : (
        <>
          <div className="main-row">
            <div className="viewer-area">
              <Viewer
                model={model}
                project={project}
                mapping={mapping}
                currentDate={currentDate}
                showGhost={showGhost}
                varianceMode={varianceMode}
                xray={xray}
                selectedElementIds={selectedElementIds}
                onPickElement={(id) => setSelection(id ? { type: 'element', id } : null)}
              />
              <div className="viewer-overlay">
                <label className="ghost-toggle">
                  <input
                    type="checkbox"
                    checked={showGhost}
                    onChange={(e) => setShowGhost(e.target.checked)}
                  />
                  Ghost future work
                </label>
                <label className="ghost-toggle" title="Fades the ground and surface work so excavation, piers, and underslab utilities are visible">
                  <input
                    type="checkbox"
                    checked={xray}
                    onChange={(e) => setXray(e.target.checked)}
                  />
                  See below grade
                </label>
                <label className="ghost-toggle" title="Colors started work by recorded % complete vs where the plan says it should be at the simulation date">
                  <input
                    type="checkbox"
                    checked={varianceMode}
                    onChange={(e) => setVarianceMode(e.target.checked)}
                  />
                  Color by schedule variance
                </label>
                {varianceMode && (
                  <div className="model-label variance-legend">
                    <span className="lg-item"><span className="lg-swatch" style={{ background: '#0ca30c' }} /> On/ahead</span>
                    <span className="lg-item"><span className="lg-swatch" style={{ background: '#fab219' }} /> &lt;20% behind</span>
                    <span className="lg-item"><span className="lg-swatch" style={{ background: '#d03b3b' }} /> Behind</span>
                  </div>
                )}
                {model && <span className="model-label">{model.label}</span>}
                <span className="model-label subtle-label">
                  Space play · ←/→ step days · click elements or task names to trace links
                </span>
              </div>
            </div>
            {sidebarOpen && (
              <aside className="sidebar">
                {selectionInfo && (
                  <div className="panel selection-panel">
                    <h3>{selectionInfo.title}</h3>
                    <p className="hint">{selectionInfo.subtitle}</p>
                    <p className="hint subtle">{selectionInfo.itemsLabel}:</p>
                    <ul className="link-list">
                      {selectionInfo.items.length > 0 ? (
                        selectionInfo.items.map((n, i) => <li key={i}>{n}</li>)
                      ) : (
                        <li>No linked schedule tasks — element follows overall project progress</li>
                      )}
                    </ul>
                    <button className="btn tiny" onClick={() => setSelection(null)}>Clear selection</button>
                  </div>
                )}
                <div className="panel">
                  <h3>Model status</h3>
                  <p className="hint">
                    {model?.elements.length ?? 0} elements · {linkedCount} linked to schedule tasks
                  </p>
                  <div className="legend-3d">
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <span key={key} className="lg-item">
                        <span
                          className="lg-swatch"
                          style={{ background: CATEGORY_COLORS[key as keyof typeof CATEGORY_COLORS] }}
                        />
                        {label}
                      </span>
                    ))}
                    <span className="lg-item">
                      <span className="lg-swatch" style={{ background: '#fab219' }} /> In progress
                    </span>
                  </div>
                  {drawingModel && (
                    <button className="btn" onClick={() => setDrawingModelPersisted(null)}>
                      Back to auto-massing model
                    </button>
                  )}
                </div>
                {unlinkedTasks.length > 0 && (
                  <div className="panel">
                    <h3>Not animating ({unlinkedTasks.length})</h3>
                    <p className="hint subtle">
                      These tasks didn't match a trade, so they drive no geometry. Renaming them with
                      a trade keyword (e.g. "drywall", "steel", "MEP") links them automatically.
                    </p>
                    <ul className="link-list">
                      {unlinkedTasks.slice(0, 10).map((t) => (
                        <li key={t.uid}>{t.name}</li>
                      ))}
                      {unlinkedTasks.length > 10 && <li>…and {unlinkedTasks.length - 10} more</li>}
                    </ul>
                  </div>
                )}
                <DrawingsPanel onModel={(m) => setDrawingModelPersisted(m)} />
              </aside>
            )}
          </div>
          <div className="bottom">
            <Timeline
              project={project}
              currentDate={currentDate}
              playing={playing}
              speed={speed}
              onTogglePlay={() => setPlaying((p) => !p)}
              onSpeedChange={setSpeed}
              onScrub={(d) => setCurrentDate(d)}
              onReset={() => {
                setPlaying(false);
                setCurrentDate(project.start);
              }}
            />
            <Gantt
              project={project}
              currentDate={currentDate}
              onScrub={setCurrentDate}
              selectedTaskUids={selectedTaskUids}
              onSelectTask={(uid) => setSelection(uid ? { type: 'task', uid } : null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
