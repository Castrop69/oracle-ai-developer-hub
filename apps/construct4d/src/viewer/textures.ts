import * as THREE from 'three';

/** Procedural canvas textures so the block model reads as real materials. */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, s: number, alpha: number, passes = 900) {
  for (let i = 0; i < passes; i++) {
    const v = Math.random();
    ctx.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${alpha * Math.random()})`;
    const r = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}

/** Curtain wall: one tile = one glass panel with mullion frame. */
export function makeCurtainWallTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#9ec4e4');
    g.addColorStop(0.5, '#7fa9cf');
    g.addColorStop(1, '#a8cce8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // spandrel band (bottom quarter of each panel)
    ctx.fillStyle = 'rgba(38,52,66,0.85)';
    ctx.fillRect(0, s * 0.76, s, s * 0.24);
    // mullions
    ctx.strokeStyle = '#1d2733';
    ctx.lineWidth = s * 0.05;
    ctx.strokeRect(0, 0, s, s);
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
  });
}

export function makeConcreteTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8b8880';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.05, 1600);
    // faint form-tie / joint lines
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((s / 4) * i, 0);
      ctx.lineTo((s / 4) * i, s);
      ctx.stroke();
    }
  });
}

export function makeAsphaltTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3c3d3e';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.07, 2200);
  });
}

export function makeGroundTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#20211c';
    ctx.fillRect(0, 0, s, s);
    // mottled earth/scrub
    for (let i = 0; i < 1400; i++) {
      const shade = Math.random();
      ctx.fillStyle =
        shade > 0.66 ? 'rgba(46,50,38,0.5)' : shade > 0.33 ? 'rgba(30,30,26,0.5)' : 'rgba(38,36,30,0.5)';
      const r = 2 + Math.random() * 9;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.repeat.set(24, 24);
  return tex;
}

export function makeRoofTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#55524b';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.06, 1800);
  });
}
