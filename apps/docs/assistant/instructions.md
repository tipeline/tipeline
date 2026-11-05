# Instructions for the Assistant

Some things the assistant can't learn from your workflows: which server is "prod", who "the team" is, what you mean by "the site". Write them down once as **instructions** and the assistant uses them in every request, instead of you repeating them or filling the form in by hand.

```
Prod is web-01. Staging is web-stg-01.
Reports go to team@acme.com.
When I say "the web service", I mean php-fpm.
```

With these, "check disk space on prod" proposes **Check Disk Space** with *Server* already set to `web-01`.

## Where they go

| Kind | Where | Used |
|------|-------|------|
| Global | **Settings → Assistant → Instructions** | In every request |
| Project | A project's **Edit** dialog → **Assistant instructions** | When you ask from the project's page, or from one of its workflows or apps. Added to the global ones. |

When you're in a project with instructions, the Assistant panel says **Using the instructions of …** above the message box. The project's page shows its instructions too.

When the two disagree, the project's win. When your request says something else ("check disk space on web-02"), the request wins.

Instructions are used for finding and filling in workflows **and** for writing drafts. A draft started from a request keeps the instructions that request was sent with.

## What to write

Good instructions are facts and preferences the assistant can't guess:

- **Names for things:** servers, sites, environments, databases. "Prod is web-01."
- **People and addresses:** "Reports go to team@acme.com." "Ana is ana@acme.com."
- **What you mean by a word:** "The site" is the Drupal one. "The web service" is php-fpm.
- **Defaults you always pick:** "Use the EU region unless I say otherwise."

Don't put here:

- **What a workflow does**: write that in its description. See [Workflows It Can Find](/assistant/findable-workflows).
- **Passwords, keys or tokens**: the instructions are sent to your AI provider with every request. Use a secret [global variable](/desktop/variables) instead.
- **Long documents**: they're sent with every request, so they cost more and make the assistant less precise.

## How long

Keep them short: **a few lines up to about 1,500 characters** (20 to 30 short lines) for each. Past that, the box shows a counter as a reminder. The limit is **4,000 characters** each.

One fact per line, written plainly, works best.

## In the terminal

`tipeline assistant prompt` uses the global instructions. Add a project's with `--project`:

```bash
tipeline assistant prompt --project "ACME client" "check disk space on prod"
```

## Backups

Project instructions go with the project in [backups and project exports](/desktop/backup). Global instructions are a setting and stay on this computer.
