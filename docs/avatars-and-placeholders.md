# Images: avatars and placeholders

[Back to the README.](https://github.com/spxis/rest-in-pieces#images-avatars-and-placeholders)

Two SVG endpoints, drawn from the URL alone: no proxy, no fetch, no other host, and `Cache-Control: public, max-age=31536000, immutable`.

```sh
curl 'http://localhost:6800/avatars/ada.svg?name=Ada%20Lovelace'     # "AL" on a colour the seed picks
curl 'http://localhost:6800/avatars/7.svg'                           # a symmetric pattern from the seed
curl 'http://localhost:6800/images/640x360.svg?text=Hero&bg=0f172a&fg=fff'
```

- **`/avatars/{seed}.svg`**: a 64 × 64 square tile in one of twelve colours the seed picks, white on a mid-tone so it reads on light and dark pages. `?name=` puts initials on it: the first letters of the first and last words (`Ada Lovelace` → `AL`, `Нонна Журавлева` → `НЖ`); a Japanese name, written family name first with a space, shows a family name of one or two characters whole (`佐藤 美穂` → `佐藤`) and the first character of a longer one (`長谷川 翔` → `長`); a Chinese or Korean name with no space shows its first character (`王`). Without a name it draws a five-by-five pattern.
- **`/images/{w}x{h}.svg`**: a flat rectangle with its size, or `?text=`, in the middle. Sides clamp to 8–4,000 pixels and text to 120 characters, and is escaped; `bg` and `fg` take hex with or without `#`, and anything else falls back to the defaults. A path that is not `{w}x{h}` is a `400`.
- **In code.** `@johnmorrisdotca/rest-in-pieces/images` exports `avatarSvg(seed, name)` and `placeholderSvg(w, h, { text, bg, fg })`, the functions the routes use, so a page can draw the same pictures with no request; the playground's UI preview does, which is how its cards show avatars on GitHub Pages and offline.
