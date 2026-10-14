import type { AppOptions } from './core.ts';

const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;
const TABLE_ATTRIBUTES = ['resource', 'rows', 'seed', 'locale', 'columns', 'lang', 'theme', 'size', 'width', 'label'];
/** Host settings for the native app, query and local record callback.
 * @example
 * ```ts
 * import type { RestTableOptions } from "@johnmorrisdotca/rest-in-pieces/element";
 * const options: RestTableOptions = { query: { country: 'CA' } };
 * console.log(options.query?.country);
 * ```
 */
export interface RestTableOptions {
  app?: AppOptions;
  query?: Record<string, string | number | boolean>;
  onLoad?: (records: readonly Record<string, unknown>[]) => void;
}
/** Native app options checked by builder coverage.
 * @example
 * ```ts
 * import { REST_TABLE_APP_KEYS } from "@johnmorrisdotca/rest-in-pieces/element";
 * console.log(REST_TABLE_APP_KEYS.includes('safe'));
 * ```
 */
export const REST_TABLE_APP_KEYS = Object.keys({
  log: true,
  specUrl: true,
  mount: true,
  session: true,
  safe: true,
  streams: true,
  flags: true,
} satisfies Record<keyof AppOptions, boolean>);
/** Local table options checked by builder coverage.
 * @example
 * ```ts
 * import { REST_TABLE_OPTION_KEYS } from "@johnmorrisdotca/rest-in-pieces/element";
 * console.log(REST_TABLE_OPTION_KEYS.includes('query'));
 * ```
 */
export const REST_TABLE_OPTION_KEYS = Object.keys({ app: true, query: true, onLoad: true } satisfies Record<
  keyof RestTableOptions,
  boolean
>);
/** A readonly sample-data table answered by the native app without installing a fetch hook.
 * Record data stays in the local getter and callback; public events carry metadata only.
 * @example
 * ```ts
 * import { RestTable } from "@johnmorrisdotca/rest-in-pieces/element";
 * console.log(RestTable.observedAttributes.includes('resource'));
 * ```
 */
export class RestTable extends ElementBase {
  static observedAttributes = TABLE_ATTRIBUTES;
  #records: Record<string, unknown>[] = [];
  #options: RestTableOptions = {};
  #app: Promise<{ fetch(request: Request): Response | Promise<Response> }> | null = null;
  #root: ShadowRoot | null = null;
  #revision = 0;
  #queued = false;
  #key = '';
  #error: Error | null = null;
  #widthBefore = '';
  #widthOwned = false;
  #watch: MutationObserver | null = null;
  /** Last native load error for trusted local diagnostics; null after a successful load. */
  get error(): Error | null {
    return this.#error;
  }
  /** Native records, empty while the table has not loaded or the request failed. */
  get records(): readonly Record<string, unknown>[] {
    return this.#records;
  }
  /** Full native app/query settings and trusted callback. */
  get options(): RestTableOptions {
    return this.#options;
  }
  set options(options: RestTableOptions) {
    const reset = this.#options.app !== options?.app;
    this.#options = options ?? {};
    if (reset) this.#app = null;
    this.#key = '';
    if (this.isConnected) void this.refresh();
  }
  #write(name: string, value: unknown): void {
    if (value === null || value === undefined) this.removeAttribute(name);
    else this.setAttribute(name, String(value));
  }
  get resource(): string | null {
    return this.getAttribute('resource');
  }
  set resource(value: string | number | boolean | null | undefined) {
    this.#write('resource', value);
  }
  get rows(): string | null {
    return this.getAttribute('rows');
  }
  set rows(value: string | number | boolean | null | undefined) {
    this.#write('rows', value);
  }
  get seed(): string | null {
    return this.getAttribute('seed');
  }
  set seed(value: string | number | boolean | null | undefined) {
    this.#write('seed', value);
  }
  get locale(): string | null {
    return this.getAttribute('locale');
  }
  set locale(value: string | number | boolean | null | undefined) {
    this.#write('locale', value);
  }
  get columns(): string | null {
    return this.getAttribute('columns');
  }
  set columns(value: string | number | boolean | null | undefined) {
    this.#write('columns', value);
  }
  get theme(): string | null {
    return this.getAttribute('theme');
  }
  set theme(value: string | number | boolean | null | undefined) {
    this.#write('theme', value);
  }
  get size(): string | null {
    return this.getAttribute('size');
  }
  set size(value: string | number | boolean | null | undefined) {
    this.#write('size', value);
  }
  get width(): string | null {
    return this.getAttribute('width');
  }
  set width(value: string | number | boolean | null | undefined) {
    this.#write('width', value);
  }
  get label(): string | null {
    return this.getAttribute('label');
  }
  set label(value: string | number | boolean | null | undefined) {
    this.#write('label', value);
  }
  connectedCallback(): void {
    this.#root ??= this.attachShadow({ mode: 'open' });
    void this.refresh();
    this.#watch = new MutationObserver(() => {
      if (!this.hasAttribute('lang')) this.#draw();
    });
    this.#watch.observe(this.ownerDocument.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  disconnectedCallback(): void {
    ++this.#revision;
    this.#watch?.disconnect();
    this.#watch = null;
    this.#key = '';
  }
  attributeChangedCallback(): void {
    if (!this.isConnected || this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected) void this.refresh();
    });
  }
  #ja(): boolean {
    return (this.closest('[lang]')?.getAttribute('lang') ?? this.ownerDocument.documentElement.lang)
      .toLowerCase()
      .startsWith('ja');
  }
  #message(text: string): void {
    if (!this.#root) return;
    this.#root.replaceChildren();
    const status = this.ownerDocument.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = text;
    this.#root.append(status);
  }
  /** Load a seeded table from the native API; presentation changes reuse already loaded records.
   * @returns A promise that settles after rendering or reporting a plain error.
   * @example
   * ```ts
   * import { RestTable } from "@johnmorrisdotca/rest-in-pieces/element";
   * console.log(typeof RestTable.prototype.refresh);
   * ```
   */
  async refresh(): Promise<void> {
    const revision = ++this.#revision;
    try {
      const dataset = this.getAttribute('resource') ?? 'names';
      if (!/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?$/.test(dataset)) throw new RangeError('Invalid dataset.');
      const rows = this.hasAttribute('rows') ? Number(this.getAttribute('rows')) : 5,
        seed = this.hasAttribute('seed') ? Number(this.getAttribute('seed')) : 1;
      if (!Number.isInteger(rows) || rows < 1 || rows > 50 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new RangeError('Choose 1–50 rows and a whole 32-bit seed.');
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(this.#options.query ?? {})) query.set(name, String(value));
      query.set('limit', String(rows));
      query.set('seed', String(seed));
      query.set('format', 'json');
      query.set('safe', String(this.#options.query?.safe ?? this.#options.app?.safe ?? true));
      if (this.hasAttribute('locale')) query.set('locale', this.getAttribute('locale') ?? '');
      const key = JSON.stringify([dataset, query.toString()]);
      if (key === this.#key) {
        this.#draw();
        return;
      }
      this.#message(this.#ja() ? 'データを読み込んでいます。' : 'Loading sample data.');
      this.#app ??= import('./core.ts').then(({ createApp }) =>
        createApp({ log: false, session: false, streams: false, ...this.#options.app }),
      );
      const response = await (await this.#app).fetch(new Request(`https://table.invalid/${dataset}?${query}`));
      if (!response.ok) throw new Error(`Request returned ${response.status}.`);
      const json: unknown = await response.json();
      const rowsFound = Array.isArray(json)
        ? json
        : typeof json === 'object' && json !== null
          ? 'results' in json
            ? json.results
            : 'data' in json
              ? json.data
              : null
          : null;
      if (!Array.isArray(rowsFound)) throw new Error('The dataset is not a list.');
      if (!this.isConnected || revision !== this.#revision) return;
      this.#error = null;
      this.#records = rowsFound
        .filter(
          (record): record is Record<string, unknown> =>
            typeof record === 'object' && record !== null && !Array.isArray(record),
        )
        .slice(0, rows);
      this.#key = key;
      this.#draw();
      this.dispatchEvent(
        new CustomEvent('rest-in-pieces-load', {
          detail: { dataset, seed, count: this.#records.length },
          bubbles: true,
          composed: true,
        }),
      );
      this.#options.onLoad?.(this.#records);
    } catch (error) {
      this.#error = error instanceof Error ? error : new Error(String(error));
      if (!this.isConnected || revision !== this.#revision) return;
      this.#records = [];
      this.#key = '';
      const message = this.#ja()
        ? 'データを読み込めませんでした。設定を確認してください。'
        : 'Sample data could not be loaded. Check the settings.';
      this.#message(message);
      this.dispatchEvent(
        new CustomEvent('rest-in-pieces-error', { detail: { message }, bubbles: true, composed: true }),
      );
    }
  }
  #draw(): void {
    if (!this.#root) return;
    const width = Number(this.getAttribute('width')),
      size = this.getAttribute('size'),
      pixels =
        this.hasAttribute('width') && Number.isFinite(width) && width > 0
          ? Math.min(width, 2000)
          : size === 'small'
            ? 320
            : size === 'medium'
              ? 480
              : size === 'large'
                ? 640
                : null;
    this.style.display = 'block';
    this.style.maxWidth = '100%';
    if (pixels !== null) {
      if (!this.#widthOwned) this.#widthBefore = this.style.width;
      this.#widthOwned = true;
      this.style.width = `${pixels}px`;
    } else if (this.#widthOwned) {
      this.style.width = this.#widthBefore;
      this.#widthOwned = false;
    }
    const style = this.ownerDocument.createElement('style');
    style.textContent = `:host{color-scheme:light dark;font:inherit}.table{--rip-paper:#fbf8f1;--rip-ink:#1f2320;--rip-rule:#ddd6c6;background:var(--rip-paper);color:var(--rip-ink);padding:12px;border-radius:12px}@media(prefers-color-scheme:dark){:host(:not([theme="light"])) .table{--rip-paper:#1d201e;--rip-ink:#ece8dc;--rip-rule:#3a3d38}}:host([theme="dark"]) .table{--rip-paper:#1d201e;--rip-ink:#ece8dc;--rip-rule:#3a3d38}table{width:100%;table-layout:fixed;border-collapse:collapse;font:inherit}caption{text-align:left;font-weight:600;margin-bottom:10px}th,td{text-align:left;overflow-wrap:anywhere;padding:8px 4px;border-bottom:1px solid var(--rip-rule);vertical-align:top}th{font-weight:600}`;
    const wrap = this.ownerDocument.createElement('div');
    wrap.className = 'table';
    const table = this.ownerDocument.createElement('table'),
      caption = this.ownerDocument.createElement('caption');
    caption.textContent = this.getAttribute('label') ?? (this.#ja() ? 'サンプルデータ' : 'Sample data');
    table.append(caption);
    const requested = this.getAttribute('columns')
        ?.split(',')
        .map((column) => column.trim())
        .filter(Boolean),
      columns = (requested?.length ? requested : Object.keys(this.#records[0] ?? {}).slice(0, 4)).slice(0, 12);
    const head = this.ownerDocument.createElement('thead'),
      header = this.ownerDocument.createElement('tr');
    for (const column of columns) {
      const cell = this.ownerDocument.createElement('th');
      cell.scope = 'col';
      cell.textContent = column;
      header.append(cell);
    }
    head.append(header);
    table.append(head);
    const body = this.ownerDocument.createElement('tbody');
    for (const record of this.#records) {
      const row = this.ownerDocument.createElement('tr');
      for (const column of columns) {
        const cell = this.ownerDocument.createElement('td'),
          value = record[column];
        cell.textContent =
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    const status = this.ownerDocument.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = this.#ja()
      ? `${this.#records.length}件のデータを読み込みました。`
      : `Loaded ${this.#records.length} records.`;
    wrap.append(table, status);
    this.#root.replaceChildren(style, wrap);
  }
}
/** Define a default or custom-tag sample table, once; safe on a server.
 * @param tagName - The tag name, rest-in-pieces-table by default.
 * @param registry - The browser registry; undefined outside a browser.
 * @returns Nothing; existing definitions are preserved.
 * @example
 * ```ts
 * import { defineTable } from "@johnmorrisdotca/rest-in-pieces/element";
 * defineTable();
 * console.log(typeof defineTable);
 * ```
 */
export function defineTable(
  tagName = 'rest-in-pieces-table',
  registry: CustomElementRegistry | undefined = typeof customElements === 'undefined' ? undefined : customElements,
): void {
  if (registry !== undefined && registry.get(tagName) === undefined)
    registry.define(tagName, tagName === 'rest-in-pieces-table' ? RestTable : class extends RestTable {});
}
