import { useSpeaker } from '../i18n/LocaleProvider.tsx';

const MAX_ROWS = 200;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Renders records as a table; columns are the union of every record's keys, in first-seen order. */
export function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const { say } = useSpeaker();
  if (rows.length === 0) {
    return <p className="table-empty">{say('table.empty')}</p>;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            // Records carry no guaranteed id, and the table is read-only, so position is a stable key.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <tr key={index}>
              {columns.map((column) => {
                const text = cell(row[column]);
                return (
                  <td key={column} title={text.length > 40 ? text : undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && (
        <p className="table-note">{say('table.truncated', { shown: MAX_ROWS, total: rows.length })}</p>
      )}
    </div>
  );
}
