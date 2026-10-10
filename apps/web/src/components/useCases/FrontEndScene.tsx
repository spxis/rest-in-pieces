import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { Avatar, isRecord, resultsOf, Stage, text, useScene, useWire, Wire } from './scene.tsx';

interface Order {
  id: number;
  status: string;
  buyer: string;
  buyerId: number;
  city: string;
  currency: string;
  lines: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
}

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(value);

function orderFrom(record: Record<string, unknown>): Order {
  const user = isRecord(record.user) ? record.user : {};
  const items = Array.isArray(record.items) ? record.items.filter(isRecord) : [];
  return {
    id: Number(record.id),
    status: text(record.orderStatus),
    buyer: `${text(user.firstName)} ${text(user.lastName)}`.trim(),
    buyerId: Number(user.id),
    city: text(user.city),
    currency: text(record.currency) || 'CAD',
    lines: items.map((item) => ({
      name: text(isRecord(item.product) ? item.product.name : item.name),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.lineTotal),
    })),
    subtotal: Number(record.subtotal),
    tax: Number(record.tax),
    taxRate: Number(record.taxRate),
    total: Number(record.total),
  };
}

/** Use case 1: a list fills a table, then an order snaps together with its buyer and products. */
export function FrontEndScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const { wire, pulse } = useWire();
  const [people, setPeople] = useState<Array<Record<string, unknown>> | null>(null);
  const [shown, setShown] = useState(0);
  const [order, setOrder] = useState<Order | null>(null);
  const [part, setPart] = useState(0);
  const [label, setLabel] = useState(`GET ${R.people.path}`);

  const scene = useScene(async (ctx) => {
    setPeople(null);
    setShown(0);
    setOrder(null);
    setPart(0);
    setLabel(`GET ${R.people.path}`);
    pulse('idle');
    await ctx.wait(250);
    pulse('out');
    const list = await ctx.call(R.people);
    await ctx.wait(500);
    pulse('back');
    const rows = resultsOf(list);
    setPeople(rows);
    for (let i = 1; i <= rows.length; i += 1) {
      setShown(i);
      await ctx.wait(110);
    }
    await ctx.wait(700);
    setLabel(`GET ${R.order.path}`);
    pulse('out');
    const reply = await ctx.call(R.order);
    await ctx.wait(500);
    pulse('back');
    setOrder(orderFrom(isRecord(reply.json) ? reply.json : {}));
    for (let i = 1; i <= 4; i += 1) {
      setPart(i);
      await ctx.wait(420);
    }
  });

  return (
    <Stage id={id} title={title} scene={scene}>
      <Wire label={label} phase={wire.phase} beat={wire.beat} />
      <div className="uc-window">
        <div className="uc-window-bar" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <table className="uc-table" aria-label={say('uc.front-end.people')} aria-busy={people === null}>
          <thead>
            <tr>
              <th scope="col">{say('uc.col.person')}</th>
              <th scope="col">{say('uc.col.city')}</th>
            </tr>
          </thead>
          <tbody>
            {people === null
              ? [0, 1, 2, 3, 4].map((row) => (
                  <tr key={row} className="uc-skeleton-row">
                    <td>
                      <span className="uc-skel" />
                    </td>
                    <td>
                      <span className="uc-skel short" />
                    </td>
                  </tr>
                ))
              : people.slice(0, shown).map((person) => {
                  const name = `${text(person.firstName)} ${text(person.lastName)}`;
                  return (
                    <tr key={text(person.id)} className="uc-in" data-testid="uc-person-row">
                      <td>
                        <span className="uc-person">
                          <Avatar name={name} id={text(person.id)} />
                          <span>
                            <b>{name}</b>
                            <small className="uc-sub">{text(person.email)}</small>
                          </span>
                        </span>
                      </td>
                      <td>{text(person.city)}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {order && (
        <section className="uc-order" aria-label={say('uc.front-end.order', { id: order.id })} data-testid="uc-order">
          <header className="uc-in">
            <b>{say('uc.front-end.order', { id: order.id })}</b>
            <span className="uc-tag">{order.status}</span>
          </header>
          {part >= 2 && (
            <p className="uc-snap-left">
              <span className="uc-label">{say('uc.front-end.buyer')}</span>
              <span className="uc-person">
                <Avatar name={order.buyer} id={order.buyerId} />
                <span>
                  <b>{order.buyer}</b>
                  <small className="uc-sub">{order.city}</small>
                </span>
              </span>
            </p>
          )}
          {part >= 3 && (
            <ul className="uc-lines uc-snap-right">
              {order.lines.map((line) => (
                <li key={line.name}>
                  <span>{line.name}</span>
                  <span className="uc-num">
                    {line.quantity} × {money(line.unitPrice, order.currency)}
                  </span>
                  <b className="uc-num">{money(line.total, order.currency)}</b>
                </li>
              ))}
            </ul>
          )}
          {part >= 4 && (
            <dl className="uc-totals uc-in">
              <dt>{say('uc.col.subtotal')}</dt>
              <dd>{money(order.subtotal, order.currency)}</dd>
              <dt>{say('uc.col.tax', { rate: Math.round(order.taxRate * 1000) / 10 })}</dt>
              <dd>{money(order.tax, order.currency)}</dd>
              <dt>
                <b>{say('uc.col.total')}</b>
              </dt>
              <dd>
                <b>{money(order.total, order.currency)}</b>
              </dd>
            </dl>
          )}
        </section>
      )}
    </Stage>
  );
}
