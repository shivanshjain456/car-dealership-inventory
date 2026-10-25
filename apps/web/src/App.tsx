import { useCallback, useEffect, useState } from 'react';
import type { UserDto } from '@motorline/contracts';
import { api, ApiClientError } from './api.js';
import AuthScreen from './components/AuthScreen.js';
import Dashboard from './components/Dashboard.js';

export default function App() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');

  useEffect(() => {
    let active = true;
    api
      .currentUser()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiClientError && error.status === 401)) {
          setSessionNotice('Your session could not be checked. Sign in to continue.');
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const endSession = useCallback(() => {
    setUser(null);
    setSessionNotice('Your session has ended. Sign in again to continue.');
  }, []);

  if (checkingSession) {
    return (
      <main className="boot-screen min-h-screen" role="status">
        <span className="boot-mark" aria-hidden="true">
          M
        </span>
        <p>Preparing the collection…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        notice={sessionNotice}
        onAuthenticated={(authenticatedUser) => {
          setSessionNotice('');
          setUser(authenticatedUser);
        }}
      />
    );
  }

  return <Dashboard key={user.id} user={user} onSessionEnded={endSession} />;
}
