import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import {
  userDtoSchema,
  type LoginInput,
  type RegisterInput,
  type UserDto,
  type UserRole
} from '@motorline/contracts';
import { HttpError } from '../errors.js';
import { hashPassword, verifyPassword } from './password.js';

const TOKEN_ISSUER = 'motorline-inventory';
const TOKEN_AUDIENCE = 'motorline-web';
const DUMMY_HASH_PROMISE = hashPassword('not-a-real-account-password-for-timing-equalization');

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface AuthResult {
  user: UserDto;
  token: string;
}

export interface AuthService {
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  createInitialAdmin(input: RegisterInput): Promise<UserDto>;
  getSessionUser(token: string): Promise<UserDto>;
  revokeSession(token: string): Promise<void>;
}

function isUniqueConstraint(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return ['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(String(error.code));
}

function toUserDto(row: UserRow): UserDto {
  return userDtoSchema.parse({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at
  });
}

export function createAuthService(database: Database.Database, jwtSecret: string): AuthService {
  const signingKey = new TextEncoder().encode(jwtSecret);

  function findById(id: string): UserRow | undefined {
    return database
      .prepare('SELECT id, email, password_hash, role, created_at FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  }

  function insertUser(email: string, passwordHash: string, role: UserRole): UserDto {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    database
      .prepare(
        'INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, email, passwordHash, role, createdAt);
    const row = findById(id);
    if (!row) throw new Error('The user insert completed without a readable row.');
    return toUserDto(row);
  }

  async function issueToken(user: UserDto): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(signingKey);
  }

  async function verifySessionToken(token: string): Promise<JWTPayload> {
    try {
      const verified = await jwtVerify(token, signingKey, {
        algorithms: ['HS256'],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
      });
      return verified.payload;
    } catch {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
  }

  function isSessionRevoked(tokenId: string): boolean {
    return Boolean(
      database
        .prepare('SELECT 1 AS revoked FROM revoked_session_tokens WHERE token_id = ?')
        .get(tokenId)
    );
  }

  async function createSession(
    email: string,
    password: string,
    role: UserRole
  ): Promise<AuthResult> {
    const passwordHash = await hashPassword(password);
    let user: UserDto;
    try {
      user = insertUser(email, passwordHash, role);
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new HttpError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists.'
        );
      }
      throw error;
    }
    return { user, token: await issueToken(user) };
  }

  return {
    async register(input) {
      return createSession(input.email, input.password, 'customer');
    },

    async login(input) {
      const row = database
        .prepare(
          'SELECT id, email, password_hash, role, created_at FROM users WHERE email = ? COLLATE NOCASE'
        )
        .get(input.email) as UserRow | undefined;
      const hash = row?.password_hash ?? (await DUMMY_HASH_PROMISE);
      const passwordMatches = await verifyPassword(input.password, hash);
      if (!row || !passwordMatches) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      const user = toUserDto(row);
      return { user, token: await issueToken(user) };
    },

    async createInitialAdmin(input) {
      const passwordHash = await hashPassword(input.password);
      const createAdminTransaction = database.transaction(() => {
        const adminCount = (
          database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as {
            count: number;
          }
        ).count;
        if (adminCount > 0) {
          throw new HttpError(
            409,
            'ADMIN_ALREADY_PROVISIONED',
            'An Admin account has already been provisioned.'
          );
        }
        return insertUser(input.email, passwordHash, 'admin');
      });

      try {
        return createAdminTransaction.immediate();
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (isUniqueConstraint(error)) {
          throw new HttpError(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'An account with this email already exists.'
          );
        }
        throw error;
      }
    },

    async getSessionUser(token) {
      const payload = await verifySessionToken(token);
      if (!payload.sub || !payload.jti || isSessionRevoked(payload.jti)) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
      }
      const row = findById(payload.sub);
      if (!row) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
      return toUserDto(row);
    },

    async revokeSession(token) {
      let payload: JWTPayload;
      try {
        payload = await verifySessionToken(token);
      } catch {
        // Logout stays idempotent: invalid or expired tokens cannot be replayed anyway.
        return;
      }
      if (!payload.jti || !payload.exp) return;

      const revokedAt = new Date().toISOString();
      const expiresAt = new Date(payload.exp * 1_000).toISOString();
      const recordRevocation = database.transaction(() => {
        database.prepare('DELETE FROM revoked_session_tokens WHERE expires_at <= ?').run(revokedAt);
        database
          .prepare(
            'INSERT OR IGNORE INTO revoked_session_tokens (token_id, expires_at, revoked_at) VALUES (?, ?, ?)'
          )
          .run(payload.jti, expiresAt, revokedAt);
      });
      recordRevocation.immediate();
    }
  };
}
