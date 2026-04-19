# Scribe

Scribe is a **desktop writing app** built with [Electron](https://www.electronjs.org/). It gives you a focused editor for Markdown and HTML documents on disk: open files from your filesystem, edit with a rich [Tiptap](https://tiptap.dev/) surface, export or save back as Markdown or HTML, and optionally use **AI-assisted** features powered by the [Vercel AI SDK](https://sdk.vercel.ai/) and OpenAI-compatible APIs.

The UI is built with **React 19**, **TypeScript**, **Tailwind CSS**, and [shadcn/ui](https://ui.shadcn.com/) patterns.

---

## Features (high level)

- **Local-first documents** — open, edit, and save files on your machine (with native dialogs where available).
- **Markdown ↔ editor** — Markdown is converted for editing and can be written back with reasonable fidelity.
- **Optional AI** — document chat and related flows when an API key is configured (see [Configuration](#configuration)).
- **Cross-platform packaging** — Electron Forge targets Windows (Squirrel), macOS (ZIP), and Linux (deb/rpm).

---

## Requirements

- **Node.js 22** (this matches CI; other LTS versions may work but are not guaranteed.)
- **npm** (comes with Node)

---

## Getting started

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd scribe
npm ci
```

### Configuration

For AI features, Scribe needs an OpenAI API key. You can either:

1. Create a `.env` file in the project root with:

   ```bash
   OPENAI_API_KEY=sk-...
   ```

2. Or set the key in the in-app **Settings** dialog (stored locally by the app).

Without a key, the editor and file workflows still work; AI actions will prompt you to configure a key.

### Run in development

```bash
npm start
```

This runs the app through **Electron Forge** with the Vite dev setup (main, preload, and renderer processes).

### Quality checks

Before opening a pull request, run the same checks as CI:

```bash
npm run check
```

This runs ESLint and `tsc --noEmit`.

Individual scripts:

| Script            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run lint`    | ESLint over `.ts` / `.tsx`                       |
| `npm run typecheck` | TypeScript compile without emitting output    |
| `npm run package` | Package the app for the current platform        |
| `npm run make`    | Generate distributables (installers/archives)    |

---

## Project layout (orientation)

| Area | Role |
| ---- | ---- |
| `src/` | Electron **main** process, preload, IPC handlers, settings, AI session plumbing |
| `components/` | React UI (editor chrome, sidebar, shell, shadcn-style primitives) |
| `lib/` | Shared utilities (Markdown I/O, IPC helpers, etc.) |
| `.github/workflows/` | CI (lint + typecheck on push/PR) |

If you use Cursor, optional agent guidance for this repo lives under `.agents/skills/` (Tiptap, shadcn, AI SDK). It is **not** required to build or run Scribe.

---

## Contributing

Contributions are welcome. This project is intended to stay **approachable for newcomers** and **respectful of maintainers’ time**. A few guidelines:

1. **Open an issue first** for larger changes (new features, refactors that touch many files, or behavior you are unsure about). That helps align on direction before you invest in a big patch.
2. **Keep pull requests focused** — one logical change per PR is easier to review and merge.
3. **Run `npm run check`** and fix any lint or type errors before submitting.
4. **Describe what and why** in the PR body so reviewers can follow your intent without guessing.

If you spot a bug, a missing doc, or rough edges in the developer experience, issues and small PRs are both appreciated.

---

## License

This project is released under the **MIT License** (see `package.json`). If you publish a fork or distribution, include license attribution as required by MIT.
