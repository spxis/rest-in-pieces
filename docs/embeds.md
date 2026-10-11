# Embed a native sample-data table

The [builder](https://spxis.github.io/rest-in-pieces/builder.html) previews seeded
data from the same native API as the playground. It prints custom-element,
iframe, module, React 19, Vue, Svelte, Angular, HTML block and URL formats.
`@johnmorrisdotca/rest-in-pieces/element` exports RestTable/defineTable without
registering a tag; `./element/define` registers rest-in-pieces-table. Both are safe
to import on a server. The published browser entries bundle their dependencies.
The native API chunk is loaded on the first table request.

## Properties and native options

Attributes reflect as properties: resource (names by default), rows (1–50,
default 5), seed (whole 32-bit number, default 1), locale (native data locale),
columns (comma-separated field names, first four by default), lang (en/ja,
interface only), theme (auto/light/dark), size (small/medium/large), width and
label (visible table caption). Resource avoids the built-in HTMLElement.dataset
property, which remains available for normal data-* attributes.

Widths are 320/480/640 pixels; explicit width takes priority and fits a narrower
parent. Removing it restores the previous host width. Theme, labels and columns
reuse loaded records. Data settings reload through the native app. Cells use text
nodes, including object/array JSON; supplied labels and values are never HTML.
Tables remain readable to screen readers and have no custom keyboard bindings.

records returns native rows locally. `options.app` accepts every AppOptions
field; `options.query` holds native filters, sorts and other query choices.
The table fixes limit/seed and JSON format to its reflected choices. Safe values
are the default, with unsafe mode available only to trusted host options.
`options.onLoad(records)` is local; error returns the native failure locally.
refresh() settles after rendering or reporting an error. Disconnect cancels stale
results; presentation updates do not replace global fetch or install interception.
The default app has sessions, logs and streams off. Host app options can opt into
native behaviour, but the frame exposes only readonly list settings.

## Frames, events and privacy

Frames live at embed/ with attribute-named query settings. Unknown/invalid
parameters are ignored, and resource/locale choices are bounded. The frame has
no storage, tracking or cookies. Only static code/assets load from the site or
jsDelivr; requests are answered by the local native app.

rest-in-pieces-load carries dataset, seed and count. rest-in-pieces-error carries
a fixed localized message. Events bubble and compose through shadow roots and
contain no rows. Frames post { type, detail }; hosts check event.origin against
the exact GitHub Pages origin and event.source against their iframe's
contentWindow. Trusted getters/callbacks retain the native rows, including custom
host-provided data. A copied iframe includes a height based on size/row count and
measured preview height.

## Troubleshooting

Use a native collection path in resource; a non-list route is an error. The
builder lists only collections available to the in-tab API. Geographic features
requiring Chizu are available from the server/static API, not this table's frame.
Empty/loading/error states show a localized status. Advanced native requirements
belong in host options; functions cannot travel in iframe URLs. Existing REST,
Node, MSW, Vite and browser-fetch APIs keep their behaviour.
