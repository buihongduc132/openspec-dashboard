# Intentions — OpenSpec Management Server

> Verbatim user request. Do NOT reword. Elaboration follows the `---` separator only.

```
Make all of these as flow/{intentions / requirements / plans} for me; --- List all the
functionalities that we need to have if I need to build the server which will expose the
management of https://github.com/Fission-AI/OpenSpec Kind of management: managing schema
in the UI managing each project specs / changes / tasks and display it as kanban board as
well. Can iterate into wekan / Vikunja

[then, appended:]

Now improve this UI for me. Make it modern Then make it the public repository with same
name and commit and push all changes. Ensure no sensitive information stays and pre-ignore
the sensitive files / directory as well ;
```

---

## Elaboration (mine, not verbatim)

The user wants a **management server + web UI** that wraps the OpenSpec CLI's mental model
(`specs/`, `changes/`, `schemas/`, `workspaces/`, `context stores`) and exposes it as a
modern, Wekan/Vikunja-style product. Key intent fragments:

1. **"expose the management of OpenSpec"** — every artifact that lives on disk under
   `openspec/` must be readable, editable, and validated through a web API + UI.
2. **"managing schema in the UI"** — schemas are first-class citizens, not config files.
   Users fork, edit, activate, and debug schemas visually.
3. **"managing each project specs / changes / tasks"** — multi-project dashboard; each
   project is a registered repo with its own `openspec/` tree.
4. **"display it as kanban board as well"** — tasks (parsed from `tasks.md`) become cards;
   board supports drag-and-drop, swimlanes, filtering. Kanban is a *projection* of the
   underlying markdown, not a separate source of truth.
5. **"Can iterate into wekan / Vikunja"** — UX borrow-list: swimlanes, labels, comments,
   checklists, due dates, calendar/list views, multi-assignee, bulk ops.
6. **"improve this UI for me. Make it modern"** — a future iteration request (not in scope
   of *this* flow creation): apply a modern design system to whatever UI exists. Recorded
   here so it isn't lost.
7. **"public repository with same name"** — repo name = `openspec-dashboard`. Public.
   Sensitive files pre-`.gitignore`d before first push.

## Out of scope for THIS flow creation

- Implementing the server / UI code.
- The "make UI modern + public repo + push" work is a separate downstream task; it depends
  on the requirements + plan produced here. It is recorded as an intention but not acted on.

## Upstream research performed by user

The user already pulled and read these OpenSpec docs before issuing this request:
- `https://github.com/Fission-AI/OpenSpec` (README)
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/README.md`
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/concepts.md`
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/cli.md`
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/workflows.md`
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/customization.md`
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/commands.md`
- `https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/getting-started.md`
- Attempted `src/lib/schema.ts` (failed — likely bundled, not in raw repo).

The two option-blocks the user pasted (Option A "OpenSpec Management Server — Complete
Functionality Specification", Option B "B is better" functional breakdown) are the user's
own draft synthesis of the above research. They are **inputs** to the requirements phase,
not verbatim intentions, and live in the findings doc.

## Source of truth for downstream artifacts

- `flow/findings/2026-06-18_openspec-data-model.md` ← what OpenSpec actually is.
- `flow/requirements/*.md` ← derived, elaborated, strong-voice requirements.
- `flow/plans/2026-06-18_openspec-dashboard-mvp.md` ← phased execution plan.
