/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { UserSession } from './types';
import LoginView from './components/LoginView';
import AdvisorDashboard from './components/AdvisorDashboard';
import ClientDashboard from './components/ClientDashboard';

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
