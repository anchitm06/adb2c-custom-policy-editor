# Azure AD B2C custom policy editor

A browser-based, visual editor for [Azure AD B2C custom policies](https://learn.microsoft.com/azure/active-directory-b2c/custom-policy-overview).
It shows user journeys as a flow and answers the questions that are hard to answer from the XML:

- **When does this step run?** Each step shows its preconditions in plain words ("Skipped if
  objectId exists"). The precondition builder writes conditions as *skip when* or *run only when*,
  explains the result and shows a table of every combination. It follows B2C's evaluation rules,
  including the rule that a `ClaimEquals` check on a missing claim is ignored.
- **Which claims are in the claims bag at this step?** For every step you see which claims are
  present, maybe present (and in which scenario they are missing) or missing, which inputs a
  technical profile needs but might not get, and which claims end up in the token. The claims map
  shows every claim against every step at a glance.
- **What did my change just do?** Every edit is checked at once: references, step order, provider
  selections, protocols, claims transformation signatures and data flow. A note reports what
  changed, for example a step that now never runs, and affected steps are highlighted. Undo and
  redo are always available.

Everything runs in your browser. Files are never uploaded. The workspace is saved in this
browser only.

## Using the site

The site has a built-in **Help** page (the Help button in the top bar) with a quick start, how to
read the flow, how preconditions and the claims bag work, how the analysis reasons, common tasks,
keyboard shortcuts, privacy, limitations and a glossary. A short tour runs on your first visit and
can be replayed from the Menu.

1. Open your policy files (all XML files of one policy set, or a .zip), or start from a Microsoft
   starter pack.
2. Pick a user journey. Select a step to read, in plain words, when it runs, what it does and which
   claims it adds or needs.
3. Change something. The whole policy is checked again after every edit.
4. Export the files from the Menu and upload them to your tenant.

Shareable links: the address bar always describes what is on screen, for example
`#/journeys/SignUpOrSignIn/step/3` or `#/library/claims/objectId`. Opening such a link after
loading a policy takes you to the same place.

Large journeys: a journey with dozens of steps is analysed step by step, so all steps are always
shown. Pick a **Scenario** (a button the user presses, whether a claim exists) to trace one case
exactly. If the analysis had to merge branches, the status bar says so.

Policy you cannot share? The Menu has **Copy analysis report**. It copies counts and timings only,
never file names, identifiers, claim names or values, so you can report how the site behaves on a
private policy without revealing it.

## Features

| Area | What you can do |
| --- | --- |
| User journeys and sub journeys | Flow view and claims map, scenarios, step outline and search, add, duplicate, delete and drag steps (renumbered automatically), provider buttons, claims exchanges, sub journey calls, token issuer |
| Preconditions | Sentence builder for steps and validation technical profiles, run-only-when mode (writes Microsoft's recommended pattern), explainer, which scenarios each precondition decides, lints, table of every case |
| Claims flow | Claims before and after each step, claims map, availability in claim pickers, input claims that may be missing, token claims |
| Technical profiles | Protocol and type, metadata with known keys, input, output, persisted and display claims, transformations, validation profiles with preconditions, includes, session management; shows which layer each value comes from |
| Inheritance | Base, localization, extensions and relying party files are merged. Edits to elements defined in the base file are written as overrides in the extensions file, as Microsoft recommends. Journeys can be copied to extensions and the relying party repointed in one click |
| Building blocks | Claims schema (rename everywhere, find usages, allowed values), claims transformations (catalog of methods and parameters), content definitions, localization, display controls, predicates |
| Alerts | Every error, warning and information note explains why it appears and links to the Microsoft Learn page that defines the rule. A weekly workflow checks that those links and anchors still work |
| XML | Full-file editor (CodeMirror) with markers, per-element XML editing, formatting and comments preserved |
| Workspace | Microsoft starter packs, import of .xml files or a .zip, export as .zip, set tenant, light and dark themes, search everything with Ctrl+K |

## Development

The app lives in [`custom-policy-editor/`](custom-policy-editor) (Angular 22, standalone components, signals, zoneless).

```bash
cd custom-policy-editor
npm ci
npm start               # http://localhost:4200
npm test                # Vitest unit tests (parser, resolver, analyzer, validation, edits)
npm run lint
npm run build
npm run check:links     # checks every Microsoft Learn link and anchor used by alerts and Help
node scripts/check-contrast.mjs   # checks the colour tokens in light and dark mode
NODE_PATH=$(npm root -g) node scripts/generate-brand-assets.mjs   # rebuilds the favicon set and link preview image in public/
```

Code layout:

- `src/app/core`: framework-free domain logic
  - `xml`: formatting-preserving XML parser and serializer
  - `parse`, `model`: typed TrustFrameworkPolicy model
  - `resolve`: inheritance chains, merging, `IncludeTechnicalProfile` flattening
  - `analysis`: step-by-step journey analysis with scenarios, precondition semantics and explainer, impact diff, shareable report
  - `validate`: diagnostics, quick fixes and the alert catalog with Microsoft documentation links
  - `edit`: edit commands (DOM mutations that keep formatting), cross-file rename
  - `catalog`: technical profile types, claims transformation methods, enums
- `src/app/state`: the signal-based editor store (files, parse, resolve, analyse, validate, undo and redo, autosave) and deep links
- `src/app/features`: UI (canvas, details panel, editors, Help, shell)
- `src/styles/tokens.scss`: the design tokens (Hallmark Cobalt theme, light and dark)

The link preview (Open Graph and Twitter card tags) lives in `src/index.html` with absolute URLs for
the GitHub Pages address. If the site moves, update them there.

Fonts (IBM Plex Sans, Familjen Grotesk, JetBrains Mono) are bundled with the app through
Fontsource, so the site makes no third-party requests.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` lints, tests, builds with `--base-href /<repo>/` and publishes to
GitHub Pages on every push to `main`. In the repository settings, set **Pages, Build and
deployment, Source** to **GitHub Actions** once. `.github/workflows/ci.yml` runs the same checks
for pull requests. `.github/workflows/links.yml` runs weekly and opens an issue when a Microsoft
Learn link used by the site stops working.

## Limitations

- Single sign-on sessions are not modelled. A step that the analysis says never runs may still run
  when an SSO session restores claims.
- The analysis assumes a technical profile's output claims are returned when it runs. The
  exceptions are optional self-asserted fields, directory reads that don't raise an error for a
  missing user, `ContinueOnError` validation profiles and claims sent by the application
  (`GetClaims`). These are treated as "maybe".
- Journeys with very many independent branches may be analysed in an approximate mode, which
  reads "maybe" in places where the answer is certain. Choose a scenario for exact results.
- Orchestration steps redefined in a derived file are merged by `Order`.
- There is no direct upload to a B2C tenant. Export the files and upload them with the Azure
  portal, the Azure AD B2C VS Code extension or Microsoft Graph.
- Azure AD B2C is no longer available to purchase for new customers (since 1 May 2025). Existing
  customers can continue to use it.

## Credits

The bundled samples are from Microsoft's
[custom policy starter pack](https://github.com/Azure-Samples/active-directory-b2c-custom-policy-starterpack)
(MIT License, Copyright (c) Microsoft Corporation, see `custom-policy-editor/public/samples/LICENSE.txt`).
Behaviour follows the Azure AD B2C reference documentation on Microsoft Learn. The visual design
follows the Cobalt theme of [Hallmark](https://github.com/Nutlope/hallmark). This project is not
affiliated with or endorsed by Microsoft.
