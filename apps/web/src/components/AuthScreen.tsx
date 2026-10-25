import { useState, type FormEvent } from 'react';
import type { UserDto } from '@motorline/contracts';
import { api, ApiClientError } from '../api.js';
import Brand from './Brand.js';

interface AuthScreenProps {
  notice?: string;
  onAuthenticated(user: UserDto): void;
}

type AuthMode = 'login' | 'register';

export default function AuthScreen({ notice, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, password });
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'We could not reach the inventory. Check your connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  const registering = mode === 'register';

  return (
    <div className="auth-shell min-h-screen">
      <header className="auth-topbar">
        <Brand />
        <span className="topbar-label">
          DEALERSHIP DESK <span aria-hidden="true">/</span> 01
        </span>
      </header>

      <main className="auth-layout">
        <section className="auth-story" aria-label="About Motorline Inventory">
          <p className="eyebrow">
            <span className="eyebrow-rule" /> A considered collection
          </p>
          <h1>
            Find the car that <em>fits</em> your next chapter.
          </h1>
          <p className="auth-story-copy">
            A clear view of the road ahead: thoughtful choices, honest availability, and the details
            that matter.
          </p>
          <div className="story-index" aria-hidden="true">
            <span>01</span>
            <span className="story-index-line" />
            <span>THE COLLECTION</span>
          </div>
          <div className="auth-art" aria-hidden="true">
            <svg viewBox="0 0 520 210" role="presentation">
              <path d="M26 178h470" className="art-ground" />
              <ellipse cx="271" cy="170" rx="187" ry="17" className="art-shadow" />
              <path
                d="M78 151c9-25 25-44 49-56l66-14 42-40c10-10 23-15 37-15h62c23 0 39 7 53 23l37 43 43 17c11 4 19 14 22 27l5 24H75l3-9Z"
                className="art-car"
              />
              <path
                d="m208 81 38-39c7-7 16-11 26-11h57c17 0 29 5 39 17l28 33H208Z"
                className="art-glass"
              />
              <path d="m305 33-1 48m-77 0h202" className="art-window-line" />
              <path d="M83 134h54m299 0h45" className="art-highlight" />
              <circle cx="160" cy="157" r="29" className="art-tyre" />
              <circle cx="160" cy="157" r="13" className="art-wheel" />
              <circle cx="423" cy="157" r="29" className="art-tyre" />
              <circle cx="423" cy="157" r="13" className="art-wheel" />
              <path d="M148 157h24m239 0h24" className="art-hub" />
              <path d="M95 120h25m369 1h17" className="art-lamp" />
            </svg>
            <span className="art-caption">MOTORLINE / FIELD NOTES 01</span>
          </div>
        </section>

        <section className="auth-panel" aria-labelledby="auth-heading">
          <div className="auth-panel-top">
            <span className="auth-step">ACCOUNT ACCESS</span>
            <span className="auth-live">
              <span /> PRIVATE SESSION
            </span>
          </div>
          <h2 id="auth-heading">
            {registering ? 'Create your account' : 'Sign in to explore the collection'}
          </h2>
          <p className="auth-panel-intro">
            {registering
              ? 'Create a customer account to browse available vehicles. Purchases update inventory only; no payment is processed.'
              : 'Your next drive is a few good choices away.'}
          </p>
          {notice && (
            <p className="form-alert" role="alert">
              {notice}
            </p>
          )}

          <form className="auth-form" onSubmit={submit}>
            <label className="field-label" htmlFor="auth-email">
              Email address
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />

            <div className="field-label-row">
              <label className="field-label" htmlFor="auth-password">
                Password
              </label>
              {!registering && <span className="field-note">12+ characters</span>}
            </div>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={registering ? 'password-policy' : undefined}
              placeholder={registering ? 'At least 12 characters' : 'Enter your password'}
            />
            {registering && (
              <p className="field-note password-policy" id="password-policy">
                Use 12 to 128 characters; spaces are okay.
              </p>
            )}

            {error && (
              <p className="form-alert" role="alert">
                {error}
              </p>
            )}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <div className="auth-switch">
            <span>{registering ? 'Already have an account?' : 'New to Motorline?'}</span>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setMode(registering ? 'login' : 'register');
                setError('');
              }}
            >
              {registering ? 'Back to sign in' : 'Create an account'}
            </button>
          </div>
          <p className="auth-assurance">
            <span aria-hidden="true">⌑</span> Secure access · Your password is never shared
          </p>
        </section>
      </main>
      <footer className="auth-footer">
        <span>Motorline Inventory</span>
        <span>Standalone inventory workspace</span>
        <span>Inventory only · no payment processing</span>
      </footer>
    </div>
  );
}
