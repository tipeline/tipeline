# Schedules

A schedule runs a workflow on its own: a daily report, a check every few minutes, a reminder tomorrow morning. You say when in plain words ("every weekday at 9am", "every 40 seconds", "tomorrow at 8am") or as a cron expression.

There are three kinds:

| Kind | Example | How it runs |
|------|---------|-------------|
| **Repeating** | every weekday at 9am | At set times, like a cron |
| **Interval** | every 40 seconds | Every so often, counted from when it's turned on |
| **Once** | tomorrow at 8am | One time, then it turns itself off |

You can create one from a workflow's Overview, from the Schedules page, from the [CLI](#cli), or by asking the [assistant](#from-the-assistant).

<div class="screenshot-placeholder" style="height: 320px;">
  <span class="placeholder-icon">⏰</span>
  <span class="placeholder-label">Schedules List</span>
  <span>Every schedule: workflow, when it runs in words, its next run, and whether it's on</span>
</div>

## Scheduling a workflow

From the workflow itself:

1. Open the workflow's **Overview**.
2. In the **Schedules** card, click **Add schedule**.
3. Type when it should run, or click one of the suggestions under the box.
4. Fill in any workflow inputs. They're used for every scheduled run.
5. Click **Create Schedule**. It's on straight away.

The **Schedules** page (sidebar → Operate) has the same form, with a workflow picker, and lists every schedule.

A [draft](/assistant/#drafts) can't be scheduled until you mark it ready.

## Saying when

Type plain words or a cron expression. Under the box, Tipeline shows what it understood and the next three runs, so you can check before saving. Times are this computer's time.

### Repeating

| You type | It runs |
|----------|---------|
| `every 30 seconds` | Every 30 seconds |
| `every 5 minutes` | Every 5 minutes |
| `every hour` | On the hour |
| `every day at 9am` | Every day at 09:00 |
| `every weekday at 8:30` | Monday to Friday at 08:30 |
| `every monday and friday at 5pm` | Mondays and Fridays at 17:00 |
| `every weekend at noon` | Saturdays and Sundays at 12:00 |
| `every 15 minutes between 9 and 17 on weekdays` | Every 15 minutes, 09:00–16:45, Monday to Friday |
| `on the 1st and 15th of every month at 6am` | Those days at 06:00 |
| `every day at 9am and 5pm` | 09:00 and 17:00 |

With a day but no time ("every monday", "monthly"), it runs at 09:00.

### Every so often

An interval that fits evenly into a minute, an hour or a day ("every 30 seconds", "every 15 minutes", "every 6 hours") runs at fixed times on the clock: :00 and :30, :00 and :15, and so on. Any other interval repeats from when the schedule is turned on:

| You type | It runs |
|----------|---------|
| `every 40 seconds` | Every 40 seconds |
| `every 45 seconds` | Every 45 seconds |
| `every 90 minutes` | Every 90 minutes |
| `every 5 hours` | Every 5 hours |
| `every 2 days` | Every 2 days |

These count from when you save the schedule or turn it back on. After Core restarts they start counting again, so the first run comes one interval after start-up. An interval like this can't be limited to certain days or hours: "every 45 seconds on weekdays" is refused. Use an even interval for that ("every 30 seconds on weekdays").

### Once

| You type | It runs |
|----------|---------|
| `tomorrow at 8am` | Once, tomorrow at 08:00 |
| `friday at 5pm` | Once, this Friday at 17:00 |
| `next monday` | Once, next Monday at 09:00 |
| `in 2 hours` | Once, two hours from now |
| `2026-11-01 08:00` | Once, at that date and time |

A one-time schedule turns itself off after it runs and shows as **Done**. To run it again, edit it and pick a new time. If the computer was off or Core wasn't running at that time, it runs as soon as Core starts.

### In Spanish

The same works in Spanish: `cada 30 segundos`, `cada 40 segundos`, `todos los días a las 9`, `de lunes a viernes a las 8`, `el día 1 de cada mes a las 9`, `cada 2 días`, `mañana a las 8`.

### Cron expressions

A cron expression has 5 fields, or 6 with **seconds** first:

```
┌──────────── second (0–59, optional)
│ ┌────────── minute (0–59)
│ │ ┌──────── hour (0–23)
│ │ │ ┌────── day of month (1–31)
│ │ │ │ ┌──── month (1–12)
│ │ │ │ │ ┌── day of week (0–6, Sunday = 0)
│ │ │ │ │ │
* * * * * *
```

| Expression | Meaning |
|------------|---------|
| `0 9 * * 1-5` | Every weekday at 9:00 |
| `*/30 * * * *` | Every 30 minutes |
| `*/20 * * * * *` | Every 20 seconds |
| `0 8 1 * *` | First day of every month at 8:00 |

### Limits

- **At most every 10 seconds.** Each run starts a new worker, which takes about a second, and every run is kept in run history. At 20 seconds that's 4,320 runs a day, so the form warns you when a schedule runs more often than every 5 minutes. For something closer to real time, use a loop inside one long-running workflow.
- **Runs never pile up.** If a run is still going when the next one is due, that one is skipped.
- **Days and hours need an even interval.** "Every 15 minutes between 9 and 17 on weekdays" works; "every 45 seconds on weekdays" doesn't, because 45 seconds doesn't fit evenly into a minute. See [Every so often](#every-so-often).
- **Times with different minutes** ("9:00 and 17:30") need two schedules.

## Managing schedules

On the **Schedules** page, and in a workflow's **Schedules** card, you can:

- **Pause** a schedule without deleting it, and turn it back on
- **Edit** when it runs or the inputs it runs with. The new schedule is saved before the old one is removed, so a mistake loses nothing.
- **Delete** it
- See **when** it runs in words, and its **next run**. A one-time schedule that has run shows **Done** and when it ran; turn it on again by editing it with a new time.

## Run history

Every scheduled run creates a run record, just like a manual run. Open the workflow and go to **Runs** to see them.

## From the assistant

Say how often in your request and the [assistant](/assistant/) offers a schedule. Nothing is created until you click.

**For a workflow you already have**, for example *"run the random numbers every 40 seconds"*, the assistant shows the workflow's form with a **Runs on its own** box reading *Every 40 seconds*. Change the timing there if you like, fill in the inputs, and click **Create schedule**. The inputs are used for every scheduled run. **Run once now** runs it a single time instead.

**For a new workflow**, for example *"create the sales report and save it to my Documents every day"*, the assistant first shows the workflow it would draft, with the timing in its own **Runs on its own** box. Edit or clear the box before clicking **Draft this workflow**. The draft does the work once, with no loop or wait for the timing, and comes with that **proposed schedule**. You'll see it on the draft card, the draft banner and the Assistant's Drafts list, and it stays off. When you've tested the draft, click **Mark ready and schedule** to turn it on, or **Mark as ready** to leave it off.

See [Assistant → Schedules](/assistant/#schedules).

## CLI

```bash
# Plain words
tipeline schedule set <workflowIdentifier> --when "every weekday at 9am"
tipeline schedule set <workflowIdentifier> --when "every 40 seconds"
tipeline schedule set <workflowIdentifier> --when "tomorrow at 8am"

# Cron
tipeline schedule set <workflowIdentifier> --cron "*/20 * * * * *"

# List and remove
tipeline schedule list
tipeline schedule remove <scheduleIdentifier>
```

See [CLI commands](/cli/commands#schedule-commands).
