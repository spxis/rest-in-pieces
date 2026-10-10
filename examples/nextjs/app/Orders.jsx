'use client';

import { useEffect, useState } from 'react';

// A seeded address: the same URL gives the same orders on every machine and after every restart.
// `expand=user` embeds each order's buyer. `delay=800` makes the loading state visible, `fail=0.5` the error state.
const ORDERS = '/api/orders?limit=8&seed=7&expand=user&delay=800';

export function Orders() {
  const [state, setState] = useState({ status: 'loading', orders: [], error: '' });
  const [flaky, setFlaky] = useState(false);

  useEffect(() => {
    let current = true;
    setState({ status: 'loading', orders: [], error: '' });
    fetch(`${ORDERS}${flaky ? '&fail=0.5' : ''}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(({ results }) => current && setState({ status: 'ready', orders: results, error: '' }))
      .catch((error) => current && setState({ status: 'error', orders: [], error: error.message }));
    return () => {
      current = false;
    };
  }, [flaky]);

  return (
    <>
      <label>
        <input type="checkbox" checked={flaky} onChange={(event) => setFlaky(event.target.checked)} /> Fail half the
        requests
      </label>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">Could not load orders: {state.error}.</p>}
      {state.status === 'ready' && (
        <ul>
          {state.orders.map((order) => (
            <li key={order.id}>
              #{order.id} for {order.user?.firstName} {order.user?.lastName}: {order.total} {order.currency}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
