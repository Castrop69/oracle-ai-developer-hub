import { useRef, useState } from 'react';
import { pdfToImages, imageFileToBase64 } from './pdfToImages';
import { interpretDrawings, type DrawingImage, type InterpretedBuilding } from './interpretDrawings';
import type { BuildingModel } from '../types';

const KEY_STORAGE = 'construct4d.apiKey';

interface DrawingsPanelProps {
  onModel: (model: BuildingModel, building: InterpretedBuilding) => void;
}

export function DrawingsPanel({ onModel }: DrawingsPanelProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) ?? '');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<InterpretedBuilding | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pushLog = (msg: string) => setLog((l) => [...l.slice(-6), msg]);

  const saveKey = (k: string) => {
    setApiKey(k);
    localStorage.setItem(KEY_STORAGE, k);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!apiKey) {
      pushLog('Enter an Anthropic API key first.');
      return;
    }
    setBusy(true);
    setLog([]);
    setResult(null);
    try {
      const images: DrawingImage[] = [];
      for (const file of Array.from(files)) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const pages = await pdfToImages(file, pushLog);
          images.push(...pages.map((data) => ({ data, mediaType: 'image/png' })));
        } else if (file.type.startsWith('image/')) {
          pushLog(`Loading ${file.name}…`);
          images.push(await imageFileToBase64(file));
        }
      }
      if (images.length === 0) {
        pushLog('No PDF pages or images found in the selection.');
        return;
      }
      const { building, model } = await interpretDrawings(apiKey, images, pushLog);
      setResult(building);
      onModel(model, building);
      pushLog('3D model rebuilt from the drawings ✓');
    } catch (e) {
      pushLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="panel">
      <h3>Drawing interpretation</h3>
      <p className="hint">
        Drop plan sheets (PDF or images) and Claude reads them — grids, dimensions, levels — and
        rebuilds the 3D model to match the actual building. Tasks re-link automatically.
      </p>
      <label className="field">
        <span>Anthropic API key</span>
        <input
          type="password"
          value={apiKey}
          placeholder="sk-ant-…"
          onChange={(e) => saveKey(e.target.value)}
        />
      </label>
      <p className="hint subtle">
        The key is kept in this browser only and calls go straight to the Anthropic API.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button className="btn primary" disabled={busy || !apiKey} onClick={() => fileRef.current?.click()}>
        {busy ? 'Interpreting…' : 'Interpret drawings'}
      </button>
      {log.length > 0 && (
        <div className="log">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {result && (
        <div className="result">
          <strong>{result.building_name}</strong>
          <p>{result.summary}</p>
          <p className="hint subtle">
            {result.levels.length} level{result.levels.length !== 1 ? 's' : ''} ·{' '}
            {result.footprint.width_m.toFixed(0)}×{result.footprint.depth_m.toFixed(0)} m footprint ·{' '}
            {result.elements.length} elements
          </p>
        </div>
      )}
    </div>
  );
}
