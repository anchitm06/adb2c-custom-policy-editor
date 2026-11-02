import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PolicyFile } from '../app/core/workspace/workspace';

const ROOT = join(process.cwd(), 'public', 'samples');

export function loadSamplePack(pack: string, files: string[] = ['TrustFrameworkBase.xml', 'TrustFrameworkLocalization.xml', 'TrustFrameworkExtensions.xml', 'SignUpOrSignin.xml', 'ProfileEdit.xml', 'PasswordReset.xml']): PolicyFile[] {
  return files.map((name) => ({ id: `${pack}/${name}`, name, text: readFileSync(join(ROOT, pack, name), 'utf8') }));
}

export function readSample(pack: string, name: string): string {
  return readFileSync(join(ROOT, pack, name), 'utf8');
}
