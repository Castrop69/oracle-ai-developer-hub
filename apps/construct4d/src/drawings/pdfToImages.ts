import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_PAGES = 8;
const MAX_DIM = 2200; // Claude Opus high-res vision handles up to 2576px on the long edge

/**
 * Renders the pages of a construction drawing PDF to base64 PNGs sized for
 * Claude's vision input. Returns at most MAX_PAGES pages.
 */
export async function pdfToImages(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<string[]> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const images: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(`Rendering sheet ${i} of ${pageCount}…`);
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_DIM / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport } as never).promise;
    images.push(canvas.toDataURL('image/png').split(',')[1]);
  }
  if (pdf.numPages > MAX_PAGES) {
    onProgress?.(`Note: only the first ${MAX_PAGES} sheets were sent for interpretation.`);
  }
  return images;
}

export async function imageFileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { data: btoa(binary), mediaType: file.type || 'image/png' };
}
