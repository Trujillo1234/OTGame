# Emmy & Opie Arcade

Two Denver games in one title-card launcher:

- **Penn Run** — drive Emmy's little car or run as Opie around the Capitol Hill loop.
- **Denver Fight Club** — choose Emmy or Opie and battle across Denver arenas.

## GitHub Pages

The `main` branch automatically builds and publishes the static arcade at:

`https://trujillo1234.github.io/OTGame/`

The Pages build supports the launcher and direct links to:

- `/OTGame/penn-run/`
- `/OTGame/denver-fight-club/`

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
npm run build:pages
```
