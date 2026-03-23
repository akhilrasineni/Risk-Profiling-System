/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { UserSession } from './types';
import LoginView from './components/LoginView';
import AdvisorDashboard from './components/AdvisorDashboard';
import ClientDashboard from './components/ClientDashboard';

/**
 * The main application component.
 * It handles the top-level routing based on the user's authentication session.
 * If no user is logged in, it displays the LoginView.
 * If an advisor is logged in, it displays the AdvisorDashboard.
 * If a client is logged in, it displays the ClientDashboard.
 * 
 * @returns A JSX element representing the application's current view.
 */
export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);

  if (!user) {
    return <LoginView onLogin={setUser} />;
  }

  if (user.role === 'advisor') {
    return <AdvisorDashboard advisor={user} onLogout={() => setUser(null)} />;
  }

  return <ClientDashboard clientSession={user} onLogout={() => setUser(null)} />;
}
