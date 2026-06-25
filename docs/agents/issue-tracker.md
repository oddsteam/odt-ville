# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `oddsteam/odt-ville`
(the `origin` remote). Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` resolves to `origin` (`oddsteam/odt-ville`)
when run inside this clone. Note there is also a `fork` remote (`zacrify/gather-onerev`);
issues belong on `oddsteam/odt-ville`, so pass `--repo oddsteam/odt-ville` if `gh` ever
picks the wrong one.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
