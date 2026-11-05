# Publishing to a Hub

A hub is a folder (or a website serving one) with a `hub.json` catalog and the files it
lists. To publish, add the file and a catalog entry.

## Layout

```
my-hub/
├── hub.json
├── tasks/
│   └── hello-world.yml
├── apps/
│   └── simple-dashboard.yml
├── plugins/
│   └── hub-greeting.zip
└── images/
    └── hello-world.png
```

For a remote hub, serve the same folder over HTTPS: Tipeline reads `<url>/hub.json` and
resolves every `file` and `image` against `<url>`. A GitHub repo works the same way —
commit the folder and add the repo's link as the hub (see [A GitHub repo as a hub](/hub/#a-github-repo-as-a-hub)).

## `hub.json`

```json
{
  "updatedAt": "2026-10-01T00:00:00Z",
  "items": [
    {
      "type": "task",
      "identifier": "hello-world",
      "name": "Hello World",
      "description": "A minimal example workflow.",
      "author": "Tipeline Hub",
      "version": "1.0.1",
      "updatedAt": "2026-09-27T00:00:00Z",
      "file": "tasks/hello-world.yml",
      "image": "images/hello-world.png"
    },
    {
      "type": "plugin",
      "identifier": "hub-greeting",
      "name": "Hub Greeting Plugin",
      "version": "1.0.0",
      "file": "plugins/hub-greeting.zip",
      "group": "hubGreeting"
    }
  ]
}
```

| Field | Required | Meaning |
|-------|:--------:|---------|
| `type` | ✓ | `task` (a workflow), `app` or `plugin` |
| `identifier` | ✓ | Unique id within the hub. Installs and updates are matched on it. |
| `name` | ✓ | Shown in the Hub browser |
| `version` | ✓ | Semver `x.y.z`. **This is what update checks compare** — see below. |
| `file` | ✓ | Path to the item, relative to the hub |
| `description`, `author`, `updatedAt` | | Shown in the Hub browser |
| `image` | | Thumbnail: a path in the hub, or a URL |
| `group` | plugins | The action group the plugin provides. Lets the assistant find the plugin a workflow needs. |
| `checksum` | | `sha256:<hex>` of the item's file. When present, Tipeline checks it before installing — see [Checksums](#checksums). |

### Workflows and apps

`file` points to the workflow or app YAML, as exported from Tipeline (**Export** on its page,
or `tipeline workflow export <id>`).

An app that uses workflows from the same hub refers to them by catalog id instead of a
local identifier, so installing the app installs them too:

```yaml
workflows:
  orders: { hub: list-orders }
```

See [Shipping workflows with an app](/apps/#shipping-workflows-with-an-app).

### Plugins

`file` points to a **zip** of the plugin folder: `index.mjs` (or `index.js`) at its root,
and a `package.json` if it has dependencies. Tipeline extracts it to
`~/Tipeline/plugins/<identifier>` and runs `npm install` there. See
[Writing a plugin](/hub/plugins#writing-a-plugin).

### Checksums

`checksum` lets Tipeline confirm that the file it fetched is the one you published. It is the
SHA-256 of the file's bytes, written as `sha256:` followed by the hex digest:

```json
"checksum": "sha256:9f2c4e…"
```

Compute it on the exact file you publish:

```bash
shasum -a 256 plugins/hub-greeting.zip   # macOS
sha256sum plugins/hub-greeting.zip       # Linux
```

Tipeline checks the file after it is fetched and before anything is installed: before a
workflow or app is read, and before a plugin zip is extracted or `npm install` runs. This
applies to updates as well as first installs, from remote and local folder hubs alike.

- **Matches** — the install goes ahead.
- **Doesn't match** — nothing is installed. A downloaded file is deleted, and the error
  names the item, the hub, and the expected and actual hashes. On an update, the installed
  copy stays as it was and the item is marked with a sync error.
- **Not `sha256:<hex>`** — refused with an error. No other algorithm is supported.
- **Missing** — the item installs without a check, so hubs written before checksums keep
  working.

## Versioning

Workflows and apps carry a `version` in `major.minor.patch` form (e.g. `1.4.2`): no `v`
prefix and no pre-release tags. A new workflow starts at `1.0.0`. Nothing forces you to bump
it correctly, so follow this convention to keep versions meaningful — especially for hub
auto-updates.

Ask *what depends on this workflow's current shape?* — a schedule, an app, a sub-workflow
step in another workflow, or someone else's install from your hub.

| Bump | When | Examples |
|------|------|----------|
| **Patch** `1.0.0 → 1.0.1` | Internal fix, same contract | Fixing a step's parameters, wording, a timeout or retry count |
| **Minor** `1.0.0 → 1.1.0` | Additive, backward compatible | A new optional input with a default, a new step that doesn't change existing outputs, a new page in an app |
| **Major** `1.0.0 → 2.0.0` | The contract changed | Removing or renaming an input or output, changing a variable's type, changing what the workflow does in a way callers must adapt to |

Apps follow the same rules, with their pages and variables playing the role of a workflow's
steps and variables. A plugin's version is whatever its `index.mjs` exports, with no format
enforced.

A major bump is never installed automatically: each user reviews it first. Minor and patch
bumps install on their own, so don't use them for a change that breaks something.

Versions only go forward. To undo a bad release, publish the old content under a **higher**
version. Listing a lower version installs nothing, and a file older than the user's copy is
refused, so people who already updated would stay on the bad release.

## Publishing an update

Update checks compare the installed copy's version with the **catalog entry's**
`version` in `hub.json`. They never open the file itself — that would mean downloading every
file on every check. So publishing a change takes two edits:

1. Bump `version` inside the workflow or app file. This becomes the installed version.
2. Bump the matching item's `version` in `hub.json` to the same value. This is what makes
   the update visible.
3. If the item has a `checksum`, recompute it for the new file. A stale checksum makes the
   update fail its check, and nothing is installed.

Forget step 2 and nothing happens: no error, the change just isn't detected. The top-level
`updatedAt` isn't used for this either.

Forget step 1 and the update is refused: the hub promises a newer version but the file doesn't
have it, so users see a sync error and keep their copy until you fix the file.

For a plugin, keep `version` in `package.json` the same as the one `index.mjs` exports. Tipeline
reads `package.json` first, so it can refuse an older or major version before any of the
package's code runs. A plugin without a `package.json` is checked once it has been loaded.

To see an update without waiting for the hourly check, click **Check now** in
**Settings → Hubs**, or run `tipeline hub check <hubId>`.

## Example: a hub on GitHub

A GitHub repo is a simple way to share a hub with a team: commits keep the history, pull
requests review changes, and GitHub decides who can read it.

### 1. Create the repo

1. On GitHub, click **New repository**. Pick the owner (your account or your
   organization), give it a name such as `tipeline-hub`, and choose **Public** or
   **Private**. Leave *Add a README* unchecked so the first push isn't rejected.
2. On your computer, make a folder with the [layout](#layout) above: a `hub.json`
   and the files it lists. To start, export a workflow from Tipeline (**Export** on its
   page) into `tasks/`, and give it a `hub.json` entry:

   ```json
   {
     "items": [
       {
         "type": "task",
         "identifier": "hello-world",
         "name": "Hello World",
         "version": "1.0.0",
         "file": "tasks/hello-world.yml"
       }
     ]
   }
   ```

3. Add a `.gitattributes` file containing `* -text`. Git then stores every file exactly as
   it is, so line-ending changes on Windows can't break a [checksum](#checksums).
4. Push it:

   ```bash
   cd tipeline-hub
   git init -b main
   git add -A
   git commit -m "First hub items"
   git remote add origin git@github.com:acme/tipeline-hub.git
   git push -u origin main
   ```

   Push over SSH (`git@github.com:…`). GitHub doesn't accept account passwords for
   `https://` pushes.

### 2. Add it in Tipeline

**Settings → Hubs → Add Hub**, type **Remote (URL)**, target
`https://github.com/acme/tipeline-hub`. A public repo needs nothing else: open **Hub** in
the sidebar and its items are there. See [A GitHub repo as a hub](/hub/#a-github-repo-as-a-hub)
for branches and folders.

### 3. Create a token (private repos)

A private repo needs an access token that can read it:

1. On GitHub, click your profile picture → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** e.g. `Tipeline hub`. **Expiration:** as long as your organization
   allows. Tipeline can't read the hub once the token expires.
3. **Resource owner:** the account or organization that owns the repo.
4. **Repository access:** **Only select repositories**, and pick the hub repo.
5. **Permissions → Repository permissions → Contents:** **Read-only**. Nothing else is
   needed. GitHub adds *Metadata: Read-only* by itself.
6. Click **Generate token** and copy it. GitHub shows it only once.

Paste it into the hub's **Access token** field when you add it, or later with the pencil
button in **Settings → Hubs**. From the terminal:

```bash
tipeline hub add acme remote https://github.com/acme/tipeline-hub --token github_pat_…
```

If the repo belongs to an organization, an owner may have to allow fine-grained tokens
(organization **Settings → Personal access tokens**), and approve yours under **Pending
requests** before it works. Until then, the hub fails with a 404.

### Sharing with a team

A token is a plain string: everyone who pastes it can read the repo. Pick one of:

- **[Tipeline Server](/server/)** — add the hub once on the Server's Core. People install
  through the Server and never see the token.
- **One shared token from a bot account** — create a GitHub user such as
  `acme-hub-reader` with read access to the repo, and make the token from that account.
  It keeps working when people leave, and only gives read access to this one repo. Replace
  it before it expires; everyone then pastes the new one.
- **A token per person** — each member makes their own. Access then follows the
  organization: removing someone cuts them off.
- **A public repo** — no token at all, when nothing in the hub is confidential.

Each computer stores its token in its own Tipeline database, so treat the token as
read-only access to the hub that anyone with access to that computer could see.
