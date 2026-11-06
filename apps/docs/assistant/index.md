# Assistant

The **Assistant** finds the workflow that does what you ask, fills in what it can from your request, and runs it once you confirm. When no workflow does it yet, it can draft one for you to test. Ask in plain language: "give me the sales report for April", "deploy the website", "write a greeting card for Ana".

The assistant never runs anything on its own. Every run starts with your click.

<div class="screenshot-placeholder" style="height: 360px;">
  <span class="placeholder-icon">🤖</span>
  <span class="placeholder-label">Assistant sidebar</span>
  <span>Docked on the right: your request, the suggested workflow with its form filled in, and the result after the run</span>
</div>

## Opening the assistant

- Click the **Bot** icon in the top bar, or press **⌘K** (Ctrl+K on Windows and Linux).
- The assistant opens as a sidebar on the right of every page. Drag its left edge to make it wider.
- Type your request in the box at the bottom. **Enter** sends it; **Shift+Enter** starts a new line.
- **New chat** clears the conversation. **History** opens the Assistant page: past requests, drafts, remembered picks and search tips.

The assistant works with the local workspace. It's turned off while you're connected to a remote Core.

The same assistant runs in the terminal — see [From the terminal](/assistant/cli) — and any
other AI tool can use your workflows through MCP — see [Connect AI tools (MCP)](/assistant/mcp).

## Setting it up

Open **Settings → Assistant** and pick a provider. Tipeline doesn't include an AI model: nothing is chosen until you pick one. Until then the Assistant says it isn't set up and links here.

| Provider | What to enter | Default model |
|----------|---------------|---------------|
| Anthropic | An API key from console.anthropic.com | `claude-opus-5-5` |
| DeepSeek | An API key from platform.deepseek.com | `deepseek-chat` |
| Gemini | An API key from aistudio.google.com | `gemini-2.5-flash` |
| OpenAI | An API key, and optionally a base URL and model for an OpenAI-compatible proxy such as LiteLLM | `gpt-4o-mini` |

The **MCP connection** fields only matter if the assistant should talk to a different
Tipeline Core. They default to this Core: `http://127.0.0.1:4002/mcp`, with Core's own API
token.

**Instructions** are facts the assistant should always know, such as which server is prod or who
gets reports. Projects can have their own. See [Instructions for the Assistant](/assistant/instructions).

The CLI reads the same settings, so setting it up here covers `tipeline assistant` too.

If you send a request before any provider is set up, the sidebar asks for one instead: pick
a provider, paste its API key and choose **Connect and send**. Your request goes out as soon
as the key is saved. Base URL, model and the MCP connection stay in Settings.

## How a request is handled

1. **Search.** The assistant looks through your installed workflows and the workflows on your enabled hubs, by name, description, tags, and their inputs' names, labels and descriptions.
2. **Suggest.** When one workflow fits, it shows that workflow's run form with the values it read from your request already filled in.
   - Fields filled from your request are marked **from your request**.
   - Required fields it couldn't fill are marked **needed**. Run stays blocked until you fill them in.
   - Other workflows that could also fit appear under **Or use:**. Click one to switch.
3. **Run.** You review the form and click **Run**. If you said how often it should run ("every 40 seconds"), you get **Create schedule** instead; see [Schedules](#schedules).
4. **Answer.** When the run finishes you get a short answer to your request, a run card with a link to the run, and the workflow's outputs.

If nothing fits, the assistant says so and offers to draft the workflow that would. See [When nothing fits](#when-nothing-fits).

Only a workflow's **public** and **protected** inputs are offered and filled. Use `protected`
for a setting the assistant may fill in that you don't want on the workflow's overview form;
see [Visibility](/workflows/files#visibility). The run card shows protected inputs too, so you
see every value before you click Run.

### Values from your request

The assistant matches what you say to each input's type and description. "April" becomes the first day of April this year for a date input. A text input follows the format its description asks for. To get better results, give your workflows' inputs clear labels and descriptions. See [Writing workflows the assistant can find](/assistant/findable-workflows).

Values only you know, like the server "prod" means, come from your [instructions](/assistant/instructions).

## When several workflows fit

If two to four workflows fit equally well and your request doesn't say which, the assistant asks **"Which one do you mean?"** and lists them. Pick one to get its form; the values it read from your request carry over.

The assistant **remembers your pick** for that kind of request. Next time ("run the deployment", "deploy please") it goes straight to the workflow you chose and says *You picked this last time*. To change your mind, pick another workflow under **Or use:**; that becomes the new remembered pick. You can also see and forget picks on the Assistant page, under **Remembered picks**. Picks are shared with the CLI.

A specific request skips the question: "deploy the website" goes straight to the website workflow.

## Workflows from a hub

Workflows on your enabled hubs show up in the search even when they aren't installed. The suggestion is marked **From *hub* · not installed** and shows the values the assistant read.

- Click **Install and continue** to install the workflow. The normal run form then takes over, with the values kept.
- If the workflow needs a plugin you don't have, the card says which one:
  - **Not installed:** if a hub offers the plugin, click **Install *plugin* from *hub***.
  - **Turned off:** open **Plugins**, turn it on, then click **Check again**.
  - **Not loaded yet:** restart Core.

  **Install and continue** stays off until the plugin is ready.

Installed workflows are preferred when an installed one and a hub one fit equally well.

## Results

After a run, the assistant's message has three parts:

| Part | What it shows |
|------|---------------|
| Answer | Two to four sentences answering your request, written by the AI from the run's outputs, their labels and descriptions, and the workflow's description |
| Run card | Finished, failed, waiting for approval or canceled, how long it took, and **Open run →** |
| Outputs | Every public variable of the workflow, by its label (hover for the name and description): values, long text you can expand, the first rows of tables, objects you can expand. When the workflow marks [outputs](/workflows/files#outputs), only those, public or protected |

The run card and outputs come straight from the run, so they're always exact, even when the answer above them is short.

::: tip What the AI provider sees
Only the workflow's outputs (public or protected) are sent to the AI provider to write the answer, or its public variables when it marks no outputs, with their labels and descriptions and the workflow's description; long outputs are cut to about 4 KB. Private and secret variables, protected variables that aren't outputs, file contents and run logs are never sent. To get better answers, see [Better answers](/assistant/findable-workflows#better-answers).
:::

## When nothing fits

If no workflow does what you asked, the assistant says so and shows **Workflow to draft**: a short description of a workflow that would, with its inputs, its steps and what it returns. When you said how often it should run, that timing is shown apart, in **Runs on its own** (see [Schedules](#schedules)). Edit either if you like, then click **Draft this workflow**.

When some of your workflows each do part of the request, they're listed under **Uses your workflows**, and the draft runs them as steps. Click **×** to leave one out. A workflow that's on a hub but not installed has an **Install** button: install it to reuse it. If you don't, the draft builds that part from actions instead, and its summary says so. In the terminal, `tipeline agent prompt` lists the same workflows and prints the `tipeline hub install workflow …` command for ones on a hub.

The assistant then:

1. Looks for your installed workflows that already do part of the request, and reads which actions exist for the rest.
2. Writes the workflow, turning the details of your request into inputs so you can reuse it. A workflow you already have becomes a [sub-workflow](/actions/subtask) step instead of being rebuilt.
3. Checks it the way a real run would: every step's fields, the order of conditions, the variables it uses, and for each sub-workflow that it's installed and ready, that the inputs it sets and the outputs it reads exist, that every required input is set, and that each value fits the type it's passed into (a list can't go into a number input). It fixes what the check finds, up to three tries.
4. Saves it as a **draft** and opens it in the builder.

A request that needs several workflows together is drafted the same way. Say you have *Get PHP version*, *Get MySQL version* and *Send email*, and you ask "get the PHP and MySQL versions and email them to me". The draft runs the first two as steps, reads their outputs, and passes them to *Send email*. This works best when those workflows mark what they return as outputs: see [Writing workflows the assistant can find](/assistant/findable-workflows). A workflow on a hub is used only once it's installed.

The card in the sidebar lists what the workflow does and anything **still to do**, such as global variables to create for API keys. The assistant never writes passwords or keys into a workflow; it reads them from global variables instead.

If it can't write a workflow that passes the checks, it shows the remaining problems. Edit the description and click **Try again**.

### When part of the request can't be done

If no action or installed workflow can do part of what you asked (say, read something there's no action or plugin for), the assistant stops before writing anything and says so: **It can't do all of this**, with each missing part and what the workflow would still do without it. Nothing is saved yet. Either:

- edit the description and click **Try again**, or
- click **Create incomplete draft** to have the rest written. The draft is marked **Incomplete draft** and lists what's **Not included**, so you know what to add yourself.

In the terminal, `tipeline agent prompt` asks the same question before drafting the rest. It never drafts an incomplete workflow without an explicit yes, even with `--yes`.

## Drafts

A draft is a workflow the assistant wrote that you haven't checked yet. It has a **Draft** badge in the Workflows list and a banner in the builder and on its Overview.

| Where it's started | Does a draft run? |
|--------------------|-------------------|
| The builder or its Overview (you click Run or Debug) | Yes, so you can test it |
| `tipeline workflow exec` | Yes |
| The assistant | No, and it isn't offered |
| A schedule | No; a draft can't be scheduled (see [Schedules](#schedules)) |
| An app | No |
| A sub-workflow step in another workflow | No |
| An MCP client (`exec_task`) | No; drafts aren't listed in search either |
| A Tipeline Server webhook | Yes — a webhook starts the run the way a direct Run does |

When it does what you want, click **Mark as ready** in the banner. From then on it's a normal workflow.

## Schedules

Say when or how often in your request, such as *"every 40 seconds"*, *"every weekday at 9am"* or *"tomorrow at 8"*, and the assistant offers a [schedule](/desktop/schedules) instead of a single run. The timing is read the same way as one you type on the Schedules page, in English or Spanish. Nothing is scheduled until you click.

### A workflow you already have

*"I need to run the random numbers every 40 seconds"*: the assistant finds **Random Numbers** and shows its form, with a **Runs on its own** box reading *Every 40 seconds*.

- Change the timing in the box if you like. It shows what it understood, or why it can't be used (for example *Schedules can run at most every 10 seconds*).
- Fill in the inputs. They're used for every scheduled run.
- Click **Create schedule**. The sidebar confirms it with the next run time and links to the workflow and to the Schedules page.
- **Run once now** runs it a single time instead.

This also works when the assistant asks which of several workflows you mean: the schedule is offered for the one you pick.

### A new workflow

*"Create the sales report and save it to my Documents every day"*: no workflow does this yet, so the assistant offers to draft one. The timing is kept apart from what the workflow does:

1. **Workflow to draft** describes one run, and **Runs on its own** holds *every day*. Edit the timing or clear it before clicking **Draft this workflow**.
2. The draft does the work once. It never loops or waits for the timing: the schedule repeats it. If a draft did both, the check refuses it and the assistant fixes it.
3. The draft card, the draft banner and the Assistant's Drafts list show the **Proposed schedule**, which stays off.
4. When you've tested the draft, click **Mark ready and schedule** to turn the schedule on, or **Mark as ready** to leave it off. If a one-time time has passed by then, the draft is still marked ready and you're told to add the schedule from the Overview.

## Workflows that can't run yet

If a suggested workflow has a step that isn't set up (for example a step dropped into the builder but never filled in), the card says *This workflow can't run yet* and names the step. **Run** stays off; click **Open in builder** to finish it.

## The Assistant page

The **Assistant** page in the sidebar has four tabs:

| Tab | What it shows |
|-----|---------------|
| History | Every request: what you asked, whether it was answered, proposed, run or failed, which workflow it used, and a link to the run |
| Drafts | Workflows the assistant drafted that you haven't marked ready, with **Open in builder** and **Mark as ready** |
| Remembered picks | Your answers to "Which one do you mean?", e.g. *deploy* → Deploy website. **Forget** one to be asked again, or **Forget all** |
| Search tips | Workflows that would be easier to find, and why: no description, a name that doesn't say what it does, no tags, inputs without a label or description, or still a draft. How to fix each one: [Writing workflows the assistant can find](/assistant/findable-workflows) |

The tab labels show how many drafts are waiting, how many picks are remembered, and how many workflows are hidden or hard to find.

## Troubleshooting

| Message | What to do |
|---------|------------|
| Couldn't reach *provider* | Your computer couldn't connect to the AI provider. Check your internet connection and try again. |
| *Provider* rejected the API key | Check the key in **Settings → Assistant**. |
| Couldn't reach Tipeline Core | Start Core with `tipeline start`. |
| Tipeline Core is out of date for the assistant (or for drafting) | Restart Core (`tipeline stop`, then `tipeline start`). |
| *Name* is a draft | Open it in the builder, test it and click **Mark as ready**. |
