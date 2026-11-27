# Inter bundled with the web app

`inter-variable.woff2` is the unmodified variable Inter font from
[rsms/inter](https://github.com/rsms/inter/blob/master/docs/font-files/InterVariable.woff2).
It is loaded by `app/layout.tsx` through `next/font/local`, with normal style,
weights 100–900, swap display, preloading and Next's adjusted fallback.
No Google Fonts request is required during compilation. Keep the font file
in the repository so clean checkouts and CI use the same bytes.

- Retrieved: 2026-11-19.
- Upstream path: `docs/font-files/InterVariable.woff2`.
- Immutable upstream [Git blob](https://api.github.com/repos/rsms/inter/git/blobs/5a8d3e72ad7ffb62af3b146e1b1f54ab5813a212): `5a8d3e72ad7ffb62af3b146e1b1f54ab5813a212`.
- SHA-256: `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`.
- Size: 352,240 bytes. This is the upstream full character set, not a Latin subset.
- License: SIL Open Font License 1.1; see [OFL.txt](./OFL.txt).
- Upstream license blob: `9b2ca37b3ffc77391d8b2ebef4a974ef32bf46ea`.

When updating, keep the family and supported weights, preserve the license,
record the new upstream blob and SHA-256, and validate the production build.
Do not replace the font with a system-specific path or a remote build-time URL.
