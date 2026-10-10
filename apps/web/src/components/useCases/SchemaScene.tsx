import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { PRODUCT_SCHEMA, R } from '../../lib/useCases.ts';
import { resultsOf, Stage, text, useScene } from './scene.tsx';

type Rows = Array<Record<string, unknown>>;
const COLUMNS = Object.keys(PRODUCT_SCHEMA.properties) as Array<keyof typeof PRODUCT_SCHEMA.properties>;

/** A property as one short line, read from the schema itself. */
function describe(name: (typeof COLUMNS)[number]): string {
  const prop: Record<string, unknown> = PRODUCT_SCHEMA.properties[name];
  if (Array.isArray(prop.enum)) return `enum  ${prop.enum.join(' | ')}`;
  if (typeof prop.pattern === 'string') return `string  /${prop.pattern}/`;
  if (typeof prop.minimum === 'number') return `${text(prop.type)}  ${prop.minimum} – ${prop.maximum}`;
  return `${text(prop.type)}  ${text(prop.format)}`;
}

/** Use case 8: a JSON Schema on one side, records that satisfy it assembling on the other, column by column. */
export function SchemaScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const [rows, setRows] = useState<Rows>([]);
  const [column, setColumn] = useState(-1);
  const [cells, setCells] = useState(0);

  const scene = useScene(async (ctx) => {
    setRows([]);
    setColumn(-1);
    setCells(0);
    await ctx.wait(250);
    const reply = await ctx.call(R.generate);
    const made = resultsOf(reply);
    setRows(made);
    for (const [index] of COLUMNS.entries()) {
      setColumn(index);
      setCells(0);
      for (let row = 1; row <= made.length; row += 1) {
        setCells(row);
        await ctx.wait(110);
      }
      await ctx.wait(220);
    }
    setColumn(COLUMNS.length);
  });

  return (
    <Stage id={id} title={title} scene={scene} className="uc-schema">
      <div className="uc-schema-grid">
        <section aria-label={say('uc.from-schema.schema')}>
          <h3>{say('uc.from-schema.schema')}</h3>
          <ul className="uc-props">
            {COLUMNS.map((name, index) => (
              <li key={name} className={index === column ? 'active' : ''}>
                <b>{name}</b>
                <span className="uc-prop-note">{describe(name)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={say('uc.from-schema.records')}>
          <h3>{say('uc.from-schema.records')}</h3>
          <table className="uc-table compact">
            <thead>
              <tr>
                {COLUMNS.map((name) => (
                  <th key={name} scope="col">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-testid="uc-generated">
              {rows.length === 0
                ? [0, 1, 2, 3].map((row) => (
                    <tr key={row}>
                      {COLUMNS.map((name) => (
                        <td key={name}>
                          <span className="uc-skel" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((record, row) => (
                    <tr key={text(record.index)}>
                      {COLUMNS.map((name, index) => {
                        const ready = index < column || column >= COLUMNS.length || (index === column && row < cells);
                        return (
                          <td key={name} className={ready ? 'uc-in' : ''}>
                            {ready ? (
                              <span className="uc-cell">{text(record[name])}</span>
                            ) : (
                              <span className="uc-skel" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
            </tbody>
          </table>
        </section>
      </div>
    </Stage>
  );
}
