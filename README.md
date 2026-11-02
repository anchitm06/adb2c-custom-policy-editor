# Azure AD B2C custom policy editor

A browser-based, visual editor for [Azure AD B2C custom policies](https://learn.microsoft.com/azure/active-directory-b2c/custom-policy-overview).
It shows user journeys as a flow, like Salesforce Flow Builder or Power Automate, and answers the
questions that are hard to answer from the XML:

- **When does this step run?** Each step shows its preconditions in plain words ("Skipped if
  objectId exists", "Runs only when MfaPreference = "Phone""). The precondition builder lets you
  write conditions as *skip when…* or *run only when…*. It explains the result, lists how every
  path through the journey is affected, and can show a truth table of every case. It follows
  B2C's evaluation rules, including the rule that a `ClaimEquals` check on a missing claim is
  ignored.
- **Which claims are in the claims bag at this step?** The journey is analysed path by path:
  each provider button, sign-up link, and claim that may or may not exist (for example after a
  directory read that doesn't fail when the user is missing). For every step you see which claims
  are **present**, **maybe present** (and on which paths they are missing), or **absent**, which
  inputs a technical profile needs but might not get, and which claims end up in the token. The
  claims timeline shows every claim × step at a glance.
- **What did my change just do?** Every edit is validated immediately: references, step ordering,
  provider selections, protocols, claims transformation signatures, and data flow. A toast reports
  the impact, for example "+1 error · step 5 now never runs · email now maybe before steps 4–7",
  and affected steps are highlighted. Undo and redo are always available.

Everything runs in your browser. Files are never uploaded; the workspace is saved in this browser's
IndexedDB only.

## Features

| Area | What you can do |
| --- | --- |
| User journeys and sub journeys | Auto-layout flow, path simulator, add/duplicate/delete/drag steps (renumbered automatically), provider buttons, claims exchanges, sub journey calls, token issuer |
| Preconditions | Sentence builder for steps and validation technical profiles, run-only-when mode (writes Microsoft's recommended pattern), explainer, per-path outcome, lints, truth table |
| Claims flow | Claims bag before/after each step, claims × steps matrix, availability in claim pickers, input claims that may be missing, token claims |
| Technical profiles | Protocol/type, metadata with known keys, input/output/persisted/display claims, transformations, validation profiles with preconditions, includes, session management; shows which layer each value comes from |
| Inheritance | Base → Localization → Extensions → relying party chains are merged. Edits to elements defined in Base are written as **overrides in the Extensions file**, as Microsoft recommends. Journeys can be copied to Extensions and the relying party repointed in one click |
| Building blocks | Claims schema (rename everywhere, find usages, allowed values), claims transformations (catalog of methods and their parameters), content definitions, localization strings, display controls, predicates |
| Relying party | Default journey, token claims with availability at token issuance, subject naming |
| XML | Full-file editor (CodeMirror) with validation markers; per-element XML editing; formatting and comments are preserved |
| Workspace | Microsoft starter packs, import of .xml files or a .zip, export of single files or a .zip, "Set tenant" placeholder replacement, dark mode |

## Development

The app lives in [`custom-policy-editor/`](custom-policy-editor) (Angular 22, standalone components, signals, zoneless).

```bash
cd custom-policy-editor
npm ci
npm start          # http://localhost:4200
npm test           # Vitest unit tests (parser, resolver, analyzer, validation, edits)
npm run lint
npm run build
```

Code layout:

- `src/app/core` – framework-free domain logic
  - `xml` – formatting-preserving XML parser/serializer
  - `parse`, `model` – typed TrustFrameworkPolicy model
  - `resolve` – inheritance chains, merging, `IncludeTechnicalProfile` flattening
  - `analysis` – journey path analysis, precondition semantics and explainer, impact diff
  - `validate` – diagnostics and quick fixes
  - `edit` – edit commands (DOM mutations that keep formatting), cross-file rename
  - `catalog` – technical profile types, claims transformation methods, enums
- `src/app/state` – the signal-based editor store (files → parse → resolve → analyse → validate, undo/redo, autosave)
- `src/app/features` – UI (canvas, inspector, editors, panels)

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` lints, tests, builds with `--base-href /<repo>/` and publishes to
GitHub Pages on every push to `main`. In the repository settings, set **Pages → Build and
deployment → Source** to **GitHub Actions** once. `.github/workflows/ci.yml` runs the same checks
for pull requests.

## Limitations

- Single sign-on sessions are not modelled. A step that the analysis says never runs may still run
  when an SSO session restores claims.
- The analysis assumes a technical profile's output claims are returned when it runs. The
  exceptions are optional self-asserted fields, directory reads that don't raise an error for a
  missing user, `ContinueOnError` validation profiles, and claims sent by the application
  (`GetClaims`). These are treated as "maybe".
- Orchestration steps redefined in a derived file are merged by `Order`.
- There is no direct upload to a B2C tenant. Export the files and upload them with the Azure
  portal, the Azure AD B2C VS Code extension, or Microsoft Graph.

## Credits

The bundled samples are from Microsoft's
[custom policy starter pack](https://github.com/Azure-Samples/active-directory-b2c-custom-policy-starterpack)
(MIT License, Copyright (c) Microsoft Corporation, see `custom-policy-editor/public/samples/LICENSE.txt`).
Behaviour follows the Azure AD B2C reference documentation on Microsoft Learn.
