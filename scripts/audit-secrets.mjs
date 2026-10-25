import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const historyMode = process.argv.includes('--history');
const MAX_TEXT_FILE_BYTES = 10_000_000;
const MAX_GIT_BLOB_BYTES = 32_000_000;
const MAX_GZIP_EXPANSION_BYTES = 96_000_000;

const listing = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  cwd: projectRoot,
  encoding: 'utf8'
});
const gitInventoryAvailable = !listing.error && listing.status === 0;

const credentialPatterns = [
  { name: 'private-key marker', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: 'GitHub token pattern',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/
  },
  { name: 'AWS access-key pattern', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Google API-key pattern', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token pattern', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'OpenAI-style secret-key pattern', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google OAuth token pattern', pattern: /\bya29\.[0-9A-Za-z_-]{20,}\b/ },
  {
    name: 'JWT-like value',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
  }
];

const disclosurePatterns = [
  {
    name: 'absolute home-directory path',
    pattern: /\/(?:home|Users)\/[^/\s]+(?:\/[^\s"'`,]*)?/i
  },
  { name: 'Windows user-directory path', pattern: /\b[A-Z]:\\Users\\[^\\\s]+/i },
  {
    name: 'numeric GitHub noreply account identifier',
    pattern: /\b\d{6,}\+[a-z0-9-]+@users\.noreply\.github\.com\b/i
  }
];

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.log',
  '.md',
  '.mjs',
  '.properties',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
  '.gz'
]);

function shouldIgnore(relativePath, isDirectory) {
  const segments = relativePath.split('/');
  const name = segments.at(-1) ?? '';
  const ignoredDirectories = new Set([
    '.git',
    '.next',
    '.nuxt',
    '.output',
    '.parcel-cache',
    '.svelte-kit',
    '.turbo',
    '.venv',
    '.vite',
    'build',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results'
  ]);

  if (isDirectory && ignoredDirectories.has(name)) return true;
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return true;
  if (/\.(?:sqlite|sqlite3|db)(?:-wal|-shm)?$/i.test(name)) return true;
  if (/\.(?:pem|key|tsbuildinfo)$/i.test(name)) return true;
  if (segments.includes('.vscode') || segments.includes('.idea')) return true;
  return name === '.DS_Store' || name === 'Thumbs.db';
}

function walkFiles(directory, parent = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = parent ? `${parent}/${entry.name}` : entry.name;
    if (shouldIgnore(relativePath, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      files.push(...walkFiles(resolve(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function isSensitivePath(relativePath) {
  const isEnvironmentFile = /(^|\/)\.env(?:\.[^/]+)?$/i.test(relativePath);
  const isExampleEnvironmentFile = relativePath === '.env.example';
  const isDatabase = /\.(?:sqlite|sqlite3|db)(?:-wal|-shm)?$/i.test(relativePath);
  return (isEnvironmentFile && !isExampleEnvironmentFile) || isDatabase;
}

function contentVariants(buffer) {
  const variants = [buffer.toString('latin1')];
  if (buffer.length > 1 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      variants.push(
        gunzipSync(buffer, { maxOutputLength: MAX_GZIP_EXPANSION_BYTES }).toString('latin1')
      );
    } catch {
      // An invalid or oversized compressed payload remains covered by its raw-byte scan.
    }
  }
  return variants;
}

function addPatternFindings(findings, location, variants, patterns) {
  for (const { name, pattern } of patterns) {
    if (variants.some((text) => pattern.test(text))) findings.push({ location, category: name });
  }
}

const files = gitInventoryAvailable
  ? listing.stdout.split('\0').filter(Boolean)
  : walkFiles(projectRoot);
if (!gitInventoryAvailable) {
  console.warn(
    'Git inventory unavailable; using a filesystem scan with project ignore rules. Staged/committed status cannot be verified.'
  );
}

const findings = [];
const blockedFiles = files.filter(isSensitivePath);
for (const file of blockedFiles) findings.push({ location: file, category: 'sensitive file path' });

let scannedCurrentTextFiles = 0;
for (const file of files) {
  if (isSensitivePath(file)) continue;
  if (!textExtensions.has(extname(file).toLowerCase()) && file !== '.env.example') continue;

  let metadata;
  try {
    metadata = statSync(resolve(projectRoot, file));
  } catch {
    continue;
  }
  if (!metadata.isFile()) continue;
  if (metadata.size > MAX_TEXT_FILE_BYTES) {
    findings.push({ location: file, category: 'text file exceeds configured audit size limit' });
    continue;
  }

  const buffer = readFileSync(resolve(projectRoot, file));
  scannedCurrentTextFiles += 1;
  const variants = contentVariants(buffer);
  addPatternFindings(findings, file, variants, credentialPatterns);
  addPatternFindings(findings, file, variants, disclosurePatterns);
}

let scannedHistoryBlobs = 0;
let scannedCommits = 0;
if (historyMode) {
  if (!gitInventoryAvailable) {
    findings.push({ location: 'Git history', category: 'history scan unavailable' });
  } else {
    const objectListing = spawnSync('git', ['rev-list', '--objects', '--all'], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    const commitListing = spawnSync('git', ['rev-list', '--all'], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });

    if (
      objectListing.error ||
      objectListing.status !== 0 ||
      commitListing.error ||
      commitListing.status !== 0
    ) {
      findings.push({ location: 'Git history', category: 'history enumeration failed' });
    } else {
      const pathByObject = new Map();
      const objectIds = new Set();
      for (const line of objectListing.stdout.split('\n')) {
        if (!line) continue;
        const separator = line.indexOf(' ');
        const objectId = separator < 0 ? line : line.slice(0, separator);
        const objectPath = separator < 0 ? '' : line.slice(separator + 1);
        objectIds.add(objectId);
        if (objectPath) {
          const paths = pathByObject.get(objectId) ?? new Set();
          paths.add(objectPath);
          pathByObject.set(objectId, paths);
        }
      }

      const objectTypeCheck = spawnSync(
        'git',
        ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
        {
          cwd: projectRoot,
          input: `${[...objectIds].join('\n')}\n`,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024
        }
      );

      if (objectTypeCheck.error || objectTypeCheck.status !== 0) {
        findings.push({ location: 'Git history', category: 'object-type scan failed' });
      } else {
        for (const line of objectTypeCheck.stdout.split('\n')) {
          const [objectId, objectType] = line.split(' ');
          if (!objectId || objectType !== 'blob') continue;
          scannedHistoryBlobs += 1;
          const objectPaths = [...(pathByObject.get(objectId) ?? [])];
          const displayPaths = objectPaths.length ? objectPaths : ['<unassociated Git blob>'];
          for (const objectPath of objectPaths) {
            if (isSensitivePath(objectPath)) {
              findings.push({ location: `history:${objectPath}`, category: 'sensitive file path' });
            }
          }

          const blob = spawnSync('git', ['cat-file', 'blob', objectId], {
            cwd: projectRoot,
            encoding: null,
            maxBuffer: MAX_GIT_BLOB_BYTES
          });
          if (blob.error || blob.status !== 0) {
            for (const objectPath of displayPaths) {
              findings.push({
                location: `history:${objectPath}`,
                category: 'Git blob scan failed or exceeded size limit'
              });
            }
            continue;
          }

          const variants = contentVariants(blob.stdout);
          for (const objectPath of displayPaths) {
            addPatternFindings(findings, `history:${objectPath}`, variants, credentialPatterns);
            addPatternFindings(findings, `history:${objectPath}`, variants, disclosurePatterns);
          }
        }
      }

      const commits = commitListing.stdout.split('\n').filter(Boolean);
      scannedCommits = commits.length;
      for (const commit of commits) {
        const commitRecord = spawnSync(
          'git',
          ['show', '-s', '--format=%B%x00%an%x00%ae%x00%cn%x00%ce', commit],
          { cwd: projectRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
        );
        if (commitRecord.error || commitRecord.status !== 0) {
          findings.push({ location: `commit:${commit}`, category: 'commit metadata scan failed' });
          continue;
        }
        const record = commitRecord.stdout;
        const separator = record.indexOf('\0');
        const message = separator < 0 ? record : record.slice(0, separator);
        const metadata = separator < 0 ? '' : record.slice(separator + 1);
        addPatternFindings(
          findings,
          `commit:${commit}`,
          [message],
          credentialPatterns.concat(disclosurePatterns)
        );
        addPatternFindings(
          findings,
          `commit-metadata:${commit}`,
          [metadata],
          credentialPatterns.concat(disclosurePatterns)
        );
      }
    }
  }
}

const uniqueFindings = [
  ...new Map(
    findings.map((finding) => [`${finding.location}\0${finding.category}`, finding])
  ).values()
];

if (uniqueFindings.length) {
  console.error(
    'Secret/data audit failed. Review the reported paths/categories; matching values are never printed.'
  );
  for (const finding of uniqueFindings) {
    console.error(`- ${finding.location} [${finding.category}]`);
  }
  process.exitCode = 1;
} else if (historyMode) {
  console.info(
    `Secret/data history audit passed: ${scannedCurrentTextFiles} current text files, ${scannedHistoryBlobs} reachable Git blobs, and ${scannedCommits} commit messages/metadata scanned; no configured credential or disclosure patterns found.`
  );
} else {
  console.info(
    `Secret/data audit passed: ${scannedCurrentTextFiles} candidate text files scanned; no configured credential patterns found.`
  );
}
