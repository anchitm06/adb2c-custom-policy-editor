import { downloadBlob } from '../../shared/present';

/** Read dropped/selected files; zip archives are expanded to their .xml entries. */
export async function readPolicyFiles(list: FileList | File[]): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const f of Array.from(list)) {
    if (/\.zip$/i.test(f.name)) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const entries = Object.values(zip.files).filter((e) => !e.dir && /\.xml$/i.test(e.name) && !e.name.startsWith('__MACOSX'));
      for (const e of entries) out.push({ name: e.name.split('/').pop()!, text: await e.async('string') });
    } else if (/\.xml$/i.test(f.name) || f.type.includes('xml')) {
      out.push({ name: f.name, text: await f.text() });
    }
  }
  return out;
}

export async function exportZip(name: string, files: { name: string; text: string }[]): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.text);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(`${name.replace(/[^\w.-]+/g, '_') || 'policies'}.zip`, blob);
}

export async function loadSample(packId: string): Promise<{ name: string; files: { name: string; text: string }[] }> {
  const base = document.baseURI;
  const idx = await fetch(new URL('samples/index.json', base)).then((r) => r.json() as Promise<{ packs: { id: string; name: string; files: string[] }[] }>);
  const pack = idx.packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Unknown sample ${packId}`);
  const files = await Promise.all(pack.files.map(async (f) => ({ name: f, text: await fetch(new URL(`samples/${pack.id}/${f}`, base)).then((r) => r.text()) })));
  return { name: pack.name, files };
}

export interface SamplePack {
  id: string;
  name: string;
  description: string;
  files: string[];
}

export async function listSamples(): Promise<{ attribution: string; packs: SamplePack[] }> {
  return fetch(new URL('samples/index.json', document.baseURI)).then((r) => r.json());
}
