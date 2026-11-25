# Hubs

A **hub** is a catalog of workflows, apps and plugins you can install with one click. A hub
can be a website, or just a folder — on your computer or a shared drive — so a team can
share its own workflows without publishing them anywhere.

## The Tipeline Hub

Every Tipeline starts with one hub already set up: **Tipeline Hub**
(`https://hub.tipeline.com`), the official catalog. It's built in, like the Local workspace:
you can't edit or remove it, but you can switch it off in **Settings → Hubs** (or
`tipeline hub disable tipeline-hub`) — say, on a machine that should only install from your
team's own hub. It stays off until you switch it back on.

## Adding a hub

**Settings → Hubs → Add Hub**, then pick a type:

| Type | Target | Catalog read from |
|------|--------|-------------------|
| **Remote (URL)** | `https://hub.example.com` | `https://hub.example.com/hub.json` |
| **Remote (URL)** | `https://github.com/owner/repo` | `hub.json` at the root of the repo's default branch |
| **Local folder** | `/path/to/shared/hub-folder` | `/path/to/shared/hub-folder/hub.json` |

From the terminal:

```bash
tipeline hub add team local_folder /Volumes/shared/tipeline-hub
tipeline hub add public remote https://hub.example.com
tipeline hub add ours remote https://github.com/acme/tipeline-hub --token <token>
tipeline hub list
```

Turn a hub off without removing it with its switch in **Settings → Hubs** (or `tipeline hub disable <id>`). Removing a
hub doesn't uninstall anything installed from it; Tipeline just stops checking it for
updates.

### A GitHub repo as a hub

Any GitHub repo holding the [hub layout](/hub/publishing#layout) can be a hub: paste the
repo's link as the target. Tipeline reads the files from `raw.githubusercontent.com`:

| Target | Read from |
|--------|-----------|
| `https://github.com/owner/repo` | the default branch |
| `https://github.com/owner/repo/tree/v2` | the `v2` branch or tag |
| `https://github.com/owner/repo/tree/main/hub` | the `hub` folder of `main` |

A branch name with a `/` in it needs the raw address instead, e.g.
`https://raw.githubusercontent.com/owner/repo/release/2.0`.

GitHub caches raw files for a few minutes, so a push can take that long to show up.

For a walkthrough, from creating the repo to sharing a token with a team, see
[Example: a hub on GitHub](/hub/publishing#example-a-hub-on-github).

### Private hubs

A remote hub can have an **access token**: Tipeline sends it as
`Authorization: Bearer <token>` with every request to the hub's own address. It's never
sent to other sites a catalog links to.

- **Private GitHub repo** — a [fine-grained personal access token](https://github.com/settings/personal-access-tokens)
  with read access to the repo's **Contents**.
- **Your own site** — any token the site accepts as a Bearer token.

Add the token when you add the hub, or later with the pencil button on the hub in
**Settings → Hubs** (or `tipeline hub token <id> [token]`; leave out the token to remove
it). The token stays in Core: Desktop, the CLI and Tipeline Server only see that one is
saved.

## Installing

Open **Hub** in the sidebar to browse every enabled hub's catalog, and click **Install**.

- **Workflows** are installed like any other and keep a link to their hub. If a workflow
  uses a plugin that isn't installed or is turned off, Tipeline lists it first, with a
  button: **Install and turn on** (when one of your hubs has it) or **Turn on**. Clicking it
  lets that plugin's code run; once nothing is missing, the install carries on.
- **Apps** install the workflows they use from the same hub too (or reuse them if they're
  already installed).
- **Plugins** are downloaded into `~/.tipeline/plugins`, and Tipeline runs `npm install` in
  their folder. That runs code from the hub, so Tipeline asks first: only continue if you
  trust the hub. A new plugin starts **turned off** — turn it on in **Plugins**.

```bash
tipeline hub catalog <hubId>
tipeline hub install workflow <hubId> <itemIdentifier>
tipeline hub install app <hubId> <itemIdentifier>
tipeline hub install plugin <hubId> <itemIdentifier>
```

The [assistant](/assistant) also searches your enabled hubs, and offers to install a
workflow — and to install and turn on the plugin it needs — when that's what fits your
request.

## Updates

Tipeline checks every enabled hub **once an hour**. To change how often, pick a choice under
**Check for updates** in **Settings → Hubs**: every 15 minutes, every hour, every 6 hours, once a
day, or only when you check.

To check now:

- Open **Plugins**, or a plugin's page. Tipeline checks the hubs your plugins came from (at most
  once a minute), and the header's **Check for updates** button checks again whenever you click it.
- Click **Check now** on the hub's card in **Settings → Hubs**.
- Run `tipeline hub check [hubId]`.

When a plugin updates, Tipeline reloads its actions in the open window: the workflow builder
shows the new fields and descriptions without restarting the app.

Each check compares your installed version with the one the hub lists:

| The hub lists | What happens |
|---|---|
| A newer **patch or minor** version | Installed automatically if **Auto-update** is on. If it's off, it's flagged for you to install. |
| A newer **major** version | Never installed on its own, even with Auto-update on. It waits for you to review it. |
| An **older** version | Never installed. It's flagged so you know the hub went backwards. |

Tipeline also reads the version inside the downloaded file, because a hub can list one version
and serve another. A file older than your copy, or with the same version as your copy, isn't
installed. A file that turns out to be a major version waits for you, whatever the catalog said.

### Plugin updates that would break workflows

Before a new plugin version replaces the installed one, Tipeline checks every saved workflow
step that uses the plugin against it. This happens on every update, automatic or not, and for
any version, because a publisher can ship a breaking change as a minor version by mistake.
A step breaks when:

- its action no longer exists, or the plugin's group was renamed;
- its settings no longer pass, such as a new required setting or a different type;
- it uses a setting the action no longer has;
- it keeps its result in a variable, and the action now returns a different type.

If any step would break, the update isn't installed and your current version keeps working.
**Hub → Updates** lists the affected workflows, and **Review update** lists each broken step.
From there you can keep your version until the workflows are fixed, or choose
**Install … anyway**. From the CLI, `tipeline hub updates` lists the steps, and
`tipeline hub update plugin <identifier> --accept-breaking` installs anyway.

The check reads each action's declared settings and result type. It can't see a change in the
shape of a result, such as a field an object no longer has, so read the publisher's notes for
a major version.

Workflows, apps and plugins all have an **Auto-update** switch and the same rules. A workflow's
is on its Overview, a plugin's is on its page, and an app's is in its **Edit** dialog.

### The Updates tab

**Hub → Updates** shows what needs you and what was installed recently. The sidebar shows a count
of what you haven't seen, and a new entry shows a notification. From the CLI, run
`tipeline hub updates`.

**Review update** shows what the new version changes before you install it:

- **Workflows:** inputs and outputs removed, changed or added, the steps that changed, any new
  access, and which apps, workflows and schedules use it.
- **Apps:** pages added and removed.
- **Plugins:** which workflows use the plugin (and the apps and schedules that run them), and
  the steps that would break if an install of this version was already held back. The new
  version's changes aren't shown before installing, because reading a plugin's package runs
  its code.

An update replaces your own edits to the item. You can go back to an earlier workflow from its
[Versions](/desktop/builder#versions) tab, but apps and plugins have no earlier versions to return to. If
you go back with Auto-update on, the next check installs a newer patch or minor version again, so
turn it off first.

If an update fails, your installed copy stays as it was, the item is marked with a sync error,
and the reason appears in the Updates tab. Tipeline tries again on the next check.

If an item disappears from its hub's catalog, your copy keeps working as installed; it's
just no longer checked for updates. If the hub can't be reached, Tipeline tries again on the
next check.

## Hubs and backups

A [full backup](/desktop/backup) doesn't include your hubs. Workflows and apps that came from
a hub are restored as local copies.

## Publishing to a hub

See [Publishing to a Hub](/hub/publishing).
