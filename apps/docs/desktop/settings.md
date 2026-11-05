# Settings

Open **Settings** at the bottom of the sidebar.

| Page | What it sets |
|------|--------------|
| **Appearance** | Light, dark or system theme; language (English, Spanish); the time zone dates are shown in |
| **Defaults** | What new workflows and apps start with: the author, and whether a new workflow is marked for this computer's platform. You can still change both in the **New** dialog. |
| **Assistant** | The AI provider, API key and model the [assistant](/assistant/#setting-it-up) uses, and its global [instructions](/assistant/instructions) |
| **Backup** | [Full backup and restore](/desktop/backup) |
| **Hubs** | The [hubs](/hub/) Tipeline installs from and checks for updates |
| **Run history** | [How long finished runs are kept](/desktop/pipelines#how-long-runs-are-kept) |
| **Cache** | Stored results of [cached](/workflows/caching) steps and workflows: how much space they use, the size limit, and **Clear all** |
| **About** | The versions of the Tipeline parts running on this computer |

## Workspaces

A **workspace** is the Core you're working on: **Local** (this computer), or a
[Tipeline Server](/server/). Switch with the workspace switcher in the sidebar; **Manage
workspaces…** at the bottom of it lists your connections.

- **Add** a server with its address and your email and password (and a code, if your
  account has two-factor sign-in).
- A server's page shows who you're signed in as and your role, lets you edit the
  connection, sign in again or switch to it, and has these tabs:

| Tab | What it's for |
|-----|---------------|
| **Overview** | Members, your role, API tokens, runs this week, the last run |
| **Users** | Admins invite users, change their role (viewer, editor, admin) and deactivate them |
| **Sessions** | Where you're signed in; revoke a session |
| **API Tokens** | Tokens for scripts and CI: create, rotate, revoke |
| **Roles** | What each role may do |
| **Security** | Two-factor sign-in for your account |
| **Webhooks** | URLs that start a workflow when something calls them |
| **Audit Log** | Who did what on the server |

See [Tipeline Server](/server/) for what each of these means on the server side.

Removing a connection only removes it from this computer. It doesn't affect the server or its
data.

Starred items, recent items and dismissed failures are kept per workspace. Windows opened
from one workspace close when you switch to another.
