# Assistant instructions test

Two workflows that need facts only you know (which server is "prod", who "the
team" is). The assistant can't get those from the workflows, so it needs
instructions to fill them in.

Install both, plus `../assistant-subworkflows/create-email-draft.yml`. Create two
projects, "ACME client" and "Internal", and put both workflows in "ACME client".

## Instructions to add

Global, in **Settings → Assistant → Instructions**:

```
Reports and summaries go to team@acme.com.
When I say "the web service", I mean php-fpm.
```

Project "ACME client", in the project's **Edit** dialog → **Assistant instructions**:

```
Prod is acme-web-01. Staging is acme-stg-01.
```

Project "Internal", same place:

```
Prod is web-01. Staging is web-stg-01.
```

## Prompts to try

| Prompt | Without instructions | With instructions |
| --- | --- | --- |
| check disk space on prod | Check Disk Space, Server empty or "prod" | Server = acme-web-01 (ACME) or web-01 (Internal) |
| restart the web service on staging | Service guessed or empty | Server = acme-stg-01 / web-stg-01, Service = php-fpm |
| email the team that the deploy is done | To empty | Create Email Draft, To = team@acme.com |
| check disk on prod and email it to the team | Draft, no fixed values | Draft with the prod server and team@acme.com |

Ask from the project's page (or a workflow inside it): the Assistant panel says
"Using the instructions of …" above the message box. From the CLI, add
`--project "ACME client"`.

Nothing needs to run: the test passes when the run form the assistant fills in
has the right values. The last prompt makes a draft, so it also tests the
instructions in the drafting prompt.
