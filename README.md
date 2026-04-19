# Scribe

<img width="2553" height="1378" alt="image" src="https://github.com/user-attachments/assets/be1dbec4-403d-44ca-90bc-fcfaa887516e" />


Scribe is an **AI-first desktop writing app** built with [Electron](https://www.electronjs.org/). You work on real **Markdown and HTML files** on disk, but the product is designed around **writing with models**: inline continuation as you type, and a **document-aware chat** that helps you draft, revise, and think alongside your file.

The editor is a rich [Tiptap](https://tiptap.dev/) surface. AI is wired through the [Vercel AI SDK](https://sdk.vercel.ai/) and OpenAI-compatible APIs. The UI uses **React 19**, **TypeScript**, **Tailwind CSS**, and [shadcn/ui](https://ui.shadcn.com/) patterns.

---

## How AI shows up today

### Tab-complete writing flow

While you type, Scribe can show a **ghost continuation** after the cursor: a short AI suggestion inferred from the text before and after your position. When a suggestion appears, press **Tab** to **insert** it; suggestions clear when you move the selection or the document changes in incompatible ways. Autocomplete runs in the main process (with abort/cancel on new keystrokes) and can be tuned in **Settings** (model, temperature, token budget, on/off).

Relevant code paths: `components/scribe-editor/use-editor-tab-autocomplete.ts`, `lib/tiptap-tab-autocomplete-extension.ts`, `src/autocomplete-agent.ts`, and the `scribe:autocomplete` IPC handler in `src/main.ts`.

### Document chat

A **sidebar chat** is tied to the document you have open. It streams assistant turns over Electron IPC, keeps **per-document chat sessions** on disk, and is meant for higher-level help: outlining sections, rewriting paragraphs, answering questions about the draft, and similar workflows—always with your current file as context.

Relevant areas: `components/document-chat-panel.tsx`, `lib/electron-ipc-chat-transport.ts`, `src/document-chat-ipc.ts`, and `src/document-chat-sessions-store.ts`.

---

## Everything else (foundation)

- **Local-first files** — open, edit, and save on your machine (native dialogs where available).
- **Markdown ↔ editor** — Markdown is converted for editing and can be saved back with reasonable fidelity.
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

### Configuration (expected for the full experience)

Configure an **OpenAI API key** so autocomplete and document chat work as intended:

1. Create a `.env` file in the project root:

   ```bash
   OPENAI_API_KEY=sk-...
   ```

2. Or set the key in the in-app **Settings** dialog (stored locally by the app).

You can still open and edit files without a key; **AI entry points will tell you to add a key** when needed.

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

| Script              | Description                                   |
| ------------------- | --------------------------------------------- |
| `npm run lint`      | ESLint over `.ts` / `.tsx`                    |
| `npm run typecheck` | TypeScript compile without emitting output  |
| `npm run package`   | Package the app for the current platform    |
| `npm run make`      | Generate distributables (installers/archives) |

---

## Roadmap and future efforts

These are the **main product priorities**—good places for collaborators to jump in or discuss in an issue before a large change.

| Priority | Direction |
| -------- | --------- |
| **1. Selection → suggest change** | Let the user **select a span** (for example a section or paragraph) and trigger **inline edit or transform**: propose a replacement or patch in context, with a clear accept/reject or diff-style flow—so targeted rewrites do not require the full chat panel. |
| **2. Plan mode for document chat** | A **planning phase** before heavy generation: the assistant asks **clarifying questions** (tone, audience, structure, constraints) and **resolves ambiguities** in the user’s goal so the following answers land closer to what they wanted with less iteration. |
| **3. Document history (mass-market friendly)** | **Version history** that feels obvious to non-developers: timelines, named snapshots, or “restore this version”—possibly backed by **Git** or another store, but **hidden complexity** where possible so writers get safety nets without learning Git. |

If you want to work on one of these, open an issue with a short sketch of UX and technical approach, or comment on an existing thread, so we can avoid duplicate effort.

---

## Project layout (orientation)

| Area                   | Role                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `src/`                 | Electron **main** process, preload, IPC, settings, AI session plumbing |
| `components/`          | React UI (editor, sidebar, chat, shell, shadcn-style primitives)       |
| `lib/`                 | Shared utilities (Markdown I/O, IPC helpers, agents, etc.)           |
| `.github/workflows/`   | CI (lint + typecheck on push/PR)                                     |

If you use Cursor, optional agent guidance for this repo lives under `.agents/skills/` (Tiptap, shadcn, AI SDK). It is **not** required to build or run Scribe.

---

## Contributing

Contributions are welcome. This project is intended to stay **approachable for newcomers** and **respectful of maintainers’ time**. A few guidelines:

1. **Open an issue first** for larger changes (new features, refactors that touch many files, or behavior you are unsure about). That helps align on direction before you invest in a big patch—especially for [roadmap](#roadmap-and-future-efforts) items.
2. **Keep pull requests focused** — one logical change per PR is easier to review and merge.
3. **Run `npm run check`** and fix any lint or type errors before submitting.
4. **Describe what and why** in the PR body so reviewers can follow your intent without guessing.

If you spot a bug, a missing doc, or rough edges in the developer experience, issues and small PRs are both appreciated.

---

## License

This project is released under the **MIT License** (see `package.json`). If you publish a fork or distribution, include license attribution as required by MIT.
