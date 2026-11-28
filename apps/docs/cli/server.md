# Run on a Server

The CLI package includes the Tipeline engine (Core), so one npm install is all a server needs to
run workflows and schedules without the Desktop app. This page covers Linux servers.

To give several people access through a browser or the phone app, put
[Tipeline Server](/server/) in front of this Core.

## Install

You need Node 24 or later.

```bash
npm i -g @tipeline/cli --allow-scripts=better-sqlite3
tipeline --version
```

`--allow-scripts=better-sqlite3` lets npm set up the SQLite module during the install. Without
it, `tipeline start` sets SQLite up the first time it runs, which needs internet access then.

Some actions need programs that aren't part of the package. Install them only if your workflows
use those actions: Chrome or Chromium for browser actions, and ffmpeg for audio and video (see
[Installation](/guide/installation)).

## Choose how Core runs

| Way | Good for | Starts after a reboot |
|-----|----------|-----------------------|
| [System service](#as-a-system-service) | A dedicated server | Yes |
| [Your own user](#as-your-own-user) | A machine you log in to, without admin rights | Yes, once linger is on |
| [Docker](#in-docker) | Containers, Kubernetes | Whenever the container starts |

One Core runs per machine, since they all use the same socket in `/tmp`. Workflows, runs,
schedules and keys are kept in `~/.tipeline` for whichever user Core runs as.

### As a system service

This runs Core as its own `tipeline` user, so its data lives in `/var/lib/tipeline/.tipeline`.

```bash
sudo useradd --system --create-home --home-dir /var/lib/tipeline --shell /usr/sbin/nologin tipeline

sudo tee /etc/systemd/system/tipeline.service > /dev/null <<EOF
[Unit]
Description=Tipeline Core
After=network-online.target
Wants=network-online.target

[Service]
User=tipeline
WorkingDirectory=/var/lib/tipeline
Environment=HOME=/var/lib/tipeline
ExecStart=$(command -v tipeline) start --foreground
Restart=on-failure
RestartSec=10
KillMode=mixed
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now tipeline
```

`tipeline start --foreground` keeps Core attached to systemd. systemd restarts it after a crash,
but not after a normal `systemctl stop`. A stop lets a running workflow finish first, for up to
`TimeoutStopSec` seconds.

Use the CLI as the `tipeline` user, so it talks to that user's Core:

```bash
sudo -u tipeline tipeline status
sudo -u tipeline tipeline workflow install ./report.yml
sudo -u tipeline tipeline schedule set <workflow-id> --when "every day at 7am"
```

To pass settings to Core, add `Environment=` lines to the unit, for example
`Environment=TIPELINE_BIND_HOST=0.0.0.0` (see [Reach it from another machine](#reach-it-from-another-machine)).

### As your own user

```bash
tipeline service install
```

This sets up a systemd user service. Core starts right away and restarts after a crash. A user
service only runs while its user is logged in, so on a server Core would stop when you log out
and stay off after a reboot. `tipeline service install` turns on **linger**, which keeps it
running. If your system doesn't let you turn that on yourself, the command prints the line for
an administrator to run:

```bash
sudo loginctl enable-linger <your-user>
```

Check it with `loginctl show-user $USER --property=Linger`, which prints `Linger=yes`.

### In Docker

```dockerfile
FROM node:24-bookworm-slim
RUN npm i -g @tipeline/cli --allow-scripts=better-sqlite3 && npm cache clean --force
ENV TIPELINE_BIND_HOST=0.0.0.0
VOLUME /root/.tipeline
EXPOSE 4000 4002
CMD ["tipeline", "start", "--foreground"]
```

```bash
docker build -t tipeline .
docker run -d --name tipeline -v tipeline-data:/root/.tipeline -p 127.0.0.1:4000:4000 tipeline
docker exec tipeline tipeline workflow list
```

Keep `/root/.tipeline` in a volume, or the workflows and runs are lost along with the container.
`docker stop` lets a running workflow finish. Docker kills the container after 10 seconds, so
give it longer with `docker stop -t 120`, or `stop_grace_period` in Compose.

## Logs

Core writes its log to `~/.tipeline/logs/start.log`. With `--foreground` it also prints the log,
so it shows up in `journalctl -u tipeline` and `docker logs tipeline`.

## Reach it from another machine

Core only accepts connections from its own machine. To use it from elsewhere, for example
through `tipeline remote` or a script, set `TIPELINE_BIND_HOST=0.0.0.0` before Core starts. Clients
need Core's token, from `~/.tipeline/.database/core.token` for the user Core runs as. Port 4000 is
the WebSocket API and port 4002 is MCP.

The token gives full access, so open these ports only on a private network, or behind a proxy
with TLS. See [Connect Other Tools](/guide/connect-other-tools).

## Upgrade

Stop Core first, so the new version is the one that runs:

```bash
sudo systemctl stop tipeline          # or: tipeline stop
sudo npm i -g @tipeline/cli@latest --allow-scripts=better-sqlite3
sudo systemctl start tipeline         # or: tipeline start
```

For Docker, rebuild the image and start a new container with the same volume.

A Core refuses a database that a newer version has already upgraded. If that happens, install
the newer version again.
