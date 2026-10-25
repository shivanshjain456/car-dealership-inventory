import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  scripts: Record<string, string>;
}

function readManifest(url: URL): PackageManifest {
  return JSON.parse(readFileSync(url, 'utf8')) as PackageManifest;
}

describe('production-facing package surface', () => {
  it('does not expose or ship a demo inventory seeding command', () => {
    const rootManifest = readManifest(new URL('../../../package.json', import.meta.url));
    const apiManifest = readManifest(new URL('../package.json', import.meta.url));
    const seedScript = new URL('../scripts/seed-demo.ts', import.meta.url);

    expect(rootManifest.scripts).not.toHaveProperty('seed:demo');
    expect(apiManifest.scripts).not.toHaveProperty('seed:demo');
    expect(existsSync(seedScript)).toBe(false);
  });
});
