import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

type ScryptParameters = {
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

const PARAMETERS: ScryptParameters = {
  N: SCRYPT_COST,
  r: SCRYPT_BLOCK_SIZE,
  p: SCRYPT_PARALLELIZATION,
  maxmem: MAX_MEMORY
};

function deriveKey(password: string, salt: Buffer, parameters = PARAMETERS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, parameters, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 512) {
    throw new TypeError('Password must be a string within the supported size limit.');
  }

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt);
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    derivedKey.toString('base64url')
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof encodedHash !== 'string' || encodedHash.length > 256) {
    return false;
  }

  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey, extra] =
    encodedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !encodedSalt ||
    !encodedKey ||
    extra !== undefined
  ) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, 'base64url');
  const expectedKey = Buffer.from(encodedKey, 'base64url');
  if (
    salt.length !== SALT_LENGTH ||
    expectedKey.length !== KEY_LENGTH ||
    salt.toString('base64url') !== encodedSalt ||
    expectedKey.toString('base64url') !== encodedKey
  ) {
    return false;
  }

  try {
    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
