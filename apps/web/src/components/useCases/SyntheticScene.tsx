import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { Avatar, isRecord, resultsOf, Stage, text, useScene } from './scene.tsx';

interface Patient {
  id: string;
  name: string;
  gender: string;
  born: string;
  mrn: string;
  place: string;
  phone: string;
  email: string;
  tag: string;
  disclaimer: string;
}

interface Invoice {
  number: string;
  customer: string;
  currency: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  tax: number;
  total: number;
  adds: boolean;
}

interface Posting {
  id: string;
  counterparty: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
}

const first = (value: unknown): Record<string, unknown> => (Array.isArray(value) && isRecord(value[0]) ? value[0] : {});
const cents = (value: number) => Math.round(value * 100);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(value);

function patientFrom(record: Record<string, unknown>): Patient {
  const name = first(record.name);
  const address = first(record.address);
  const telecom = Array.isArray(record.telecom) ? record.telecom.filter(isRecord) : [];
  const meta = isRecord(record.meta) ? record.meta : {};
  const tag = first(meta.tag);
  const mrn = first(record.identifier);
  return {
    id: text(record.id),
    name: text(name.text),
    gender: text(record.gender),
    born: text(record.birthDate),
    mrn: text(mrn.value),
    place: [address.city, address.state, address.country].map(text).filter(Boolean).join(', '),
    phone: text(telecom.find((entry) => entry.system === 'phone')?.value),
    email: text(telecom.find((entry) => entry.system === 'email')?.value),
    tag: text(tag.code).toUpperCase(),
    disclaimer: text(tag.display),
  };
}

function invoiceFrom(record: Record<string, unknown>): Invoice {
  const lines = (Array.isArray(record.lines) ? record.lines.filter(isRecord) : []).map((line) => ({
    description: text(line.description),
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    total: Number(line.lineTotal),
  }));
  const subtotal = Number(record.subtotal);
  const tax = Number(record.tax);
  const total = Number(record.total);
  return {
    number: text(record.number),
    customer: text(record.customer),
    currency: text(record.currency) || 'CAD',
    lines,
    subtotal,
    tax,
    total,
    adds:
      lines.every((line) => cents(line.quantity * line.unitPrice) === cents(line.total)) &&
      cents(lines.reduce((sum, line) => sum + line.total, 0)) === cents(subtotal) &&
      cents(subtotal + tax) === cents(total),
  };
}

/** Use case 10: an invented patient, an invoice that adds up and the transactions of an account. */
export function SyntheticScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const [step, setStep] = useState(0);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [postings, setPostings] = useState<Posting[]>([]);
  const [shown, setShown] = useState(0);

  const scene = useScene(async (ctx) => {
    setStep(0);
    setPatient(null);
    setInvoice(null);
    setPostings([]);
    setShown(0);
    await ctx.wait(250);
    const [p, i, t] = await Promise.all([ctx.call(R.patient), ctx.call(R.invoice), ctx.call(R.transactions)]);
    setStep(1);
    setPatient(patientFrom(resultsOf(p)[0] ?? {}));
    await ctx.wait(1100);
    setStep(2);
    setInvoice(invoiceFrom(resultsOf(i)[0] ?? {}));
    await ctx.wait(1300);
    setStep(3);
    const rows = resultsOf(t).map((row) => ({
      id: text(row.id),
      counterparty: text(row.counterparty),
      category: text(row.category),
      amount: Number(row.amount),
      currency: text(row.currency) || 'CAD',
      status: text(row.transactionStatus),
    }));
    setPostings(rows);
    for (let at = 1; at <= rows.length; at += 1) {
      setShown(at);
      await ctx.wait(220);
    }
  });

  return (
    <Stage id={id} title={title} scene={scene}>
      <p className="uc-invented" data-testid="uc-invented">
        <b>{say('uc.healthcare-fintech.invented')}</b> {say('uc.healthcare-fintech.inventedDetail')}
      </p>
      {patient && step >= 1 && (
        <section
          className="uc-card-mini uc-in"
          aria-label={say('uc.healthcare-fintech.patient')}
          data-testid="uc-patient"
        >
          <header>
            <span className="uc-person">
              <Avatar name={patient.name} id={patient.id} />
              <span>
                <b>{patient.name}</b>
                <small className="uc-sub">
                  Patient/{patient.id} · {patient.mrn}
                </small>
              </span>
            </span>
            <span className="uc-tag warn" data-testid="uc-synthetic-tag">
              {patient.tag}
            </span>
          </header>
          <dl className="uc-fields">
            <div>
              <dt>{say('uc.col.born')}</dt>
              <dd>
                {patient.born} · {patient.gender}
              </dd>
            </div>
            <div>
              <dt>{say('uc.col.place')}</dt>
              <dd>{patient.place}</dd>
            </div>
            <div>
              <dt>{say('uc.col.contact')}</dt>
              <dd>
                {patient.phone} · {patient.email}
              </dd>
            </div>
          </dl>
          <p className="uc-note">{patient.disclaimer}</p>
        </section>
      )}
      {invoice && step >= 2 && (
        <section
          className="uc-card-mini uc-in"
          aria-label={say('uc.healthcare-fintech.invoice')}
          data-testid="uc-invoice"
        >
          <header>
            <b>{invoice.number}</b>
            <small className="uc-sub">{invoice.customer}</small>
          </header>
          <ul className="uc-lines">
            {invoice.lines.map((line) => (
              <li key={line.description}>
                <span>{line.description}</span>
                <span className="uc-num">
                  {line.quantity} × {money(line.unitPrice, invoice.currency)}
                </span>
                <b className="uc-num">{money(line.total, invoice.currency)}</b>
              </li>
            ))}
          </ul>
          <dl className="uc-totals">
            <dt>{say('uc.col.subtotal')}</dt>
            <dd>{money(invoice.subtotal, invoice.currency)}</dd>
            <dt>{say('uc.col.taxPlain')}</dt>
            <dd>{money(invoice.tax, invoice.currency)}</dd>
            <dt>
              <b>{say('uc.col.total')}</b>
            </dt>
            <dd>
              <b>{money(invoice.total, invoice.currency)}</b>
            </dd>
          </dl>
          <p className={`uc-verdict ${invoice.adds ? 'ok' : 'bad'}`} data-testid="uc-adds">
            {invoice.adds ? say('uc.healthcare-fintech.adds') : say('uc.healthcare-fintech.doesNotAdd')}
          </p>
        </section>
      )}
      {step >= 3 && (
        <section
          className="uc-card-mini uc-in"
          aria-label={say('uc.healthcare-fintech.transactions')}
          data-testid="uc-transactions"
        >
          <header>
            <b>{say('uc.healthcare-fintech.transactions')}</b>
          </header>
          <ul className="uc-lines">
            {postings.slice(0, shown).map((posting) => (
              <li key={posting.id} className="uc-in">
                <span>{posting.counterparty}</span>
                <span className="uc-tag">{posting.status}</span>
                <b className={`uc-num ${posting.amount < 0 ? 'neg' : 'pos'}`}>
                  {money(posting.amount, posting.currency)}
                </b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Stage>
  );
}
