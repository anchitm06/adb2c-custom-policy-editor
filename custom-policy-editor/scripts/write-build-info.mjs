// Writes src/build-info.ts with the commit and date of this build, for the About section of the Help
// page and the analysis report. Run by the deploy and CI workflows before `ng build`.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function git(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const sha = process.env.GITHUB_SHA || git('git rev-parse HEAD');
const commit = sha ? sha.slice(0, 7) : 'unknown';
const date = new Date().toISOString().slice(0, 10);

const text = `/** Written by scripts/write-build-info.mjs during the deploy build. The committed copy holds development values. */
export const BUILD_INFO = { commit: '${commit}', date: '${date}' } as const;
`;
writeFileSync(new URL('../src/build-info.ts', import.meta.url), text);
console.log(`build info: ${commit} ${date}`);
