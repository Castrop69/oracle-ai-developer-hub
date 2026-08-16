import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Viewer } from './viewer/Viewer';
import { Gantt } from './gantt/Gantt';
import { Timeline } from './controls/Timeline';
import { DrawingsPanel } from './drawings/DrawingsPanel';
import { useProjectFile } from './msp/useProjectFile';
import { generateModelFromSchedule } from './model/generateModelFromSchedule';
import { autoMap } from './mapping/autoMap';
import type { BuildingModel, Mapping, ProjectData } from './types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './types';

export default function App() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(7);
  const [showGhost, setShowGhost] = useState(true);
  const [drawingModel, setDrawingModel] = useState<BuildingModel | null>(null);
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

  const loadSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-schedule.xml`);
    projectFile.importText(await res.text());
  };

  const linkedCount = Object.keys(mapping).length;

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
                {model && <span className="model-label">{model.label}</span>}
              </div>
            </div>
            {sidebarOpen && (
              <aside className="sidebar">
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
                    <button className="btn" onClick={() => setDrawingModel(null)}>
                      Back to auto-massing model
                    </button>
                  )}
                </div>
                <DrawingsPanel onModel={(m) => setDrawingModel(m)} />
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
            <Gantt project={project} currentDate={currentDate} onScrub={setCurrentDate} />
          </div>
        </>
      )}
    </div>
  );
}
