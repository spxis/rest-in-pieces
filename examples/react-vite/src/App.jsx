import { useEffect, useState } from 'react';

// A seeded address: the same URL gives the same ten users on every machine and after every restart.
const USERS = '/api/users?limit=10&seed=7';

export function App() {
  const [state, setState] = useState({ status: 'loading', users: [], error: '' });
  // `fail=0.5` makes half the requests fail, to see the error state. `delay=800` makes the loading state visible.
  const [flaky, setFlaky] = useState(false);

  useEffect(() => {
    let current = true;
    setState({ status: 'loading', users: [], error: '' });
    fetch(`${USERS}&delay=800${flaky ? '&fail=0.5' : ''}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(({ results }) => current && setState({ status: 'ready', users: results, error: '' }))
      .catch((error) => current && setState({ status: 'error', users: [], error: error.message }));
    return () => {
      current = false;
    };
  }, [flaky]);

  return (
    <main>
      <h1>Users</h1>
      <label>
        <input type="checkbox" checked={flaky} onChange={(event) => setFlaky(event.target.checked)} /> Fail half the
        requests
      </label>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">Could not load users: {state.error}. Reload to try again.</p>}
      {state.status === 'ready' && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
            </tr>
          </thead>
          <tbody>
            {state.users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.firstName} {user.lastName}
                </td>
                <td>{user.email}</td>
                <td>{user.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
