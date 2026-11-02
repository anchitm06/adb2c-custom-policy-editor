/**
 * The text of the Help page. No imports on purpose: scripts/check-doc-links.mjs reads the
 * learn.microsoft.com links in this file and checks that each page and anchor still exists.
 *
 * Inline marks in text: **bold**, `code` and [label](url). Links that start with # stay on this site.
 */

export type Block =
  | { t: 'p'; text: string }
  | { t: 'steps'; items: string[] }
  | { t: 'list'; items: string[] }
  | { t: 'note'; title: string; text: string }
  | { t: 'terms'; items: { term: string; def: string }[] };

export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  blocks: Block[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'quick-start',
    title: 'Quick start',
    summary: 'From your policy files to a checked, exported policy in five steps.',
    blocks: [
      { t: 'p', text: 'This site edits Azure AD B2C custom policies in your browser. Your files are not uploaded anywhere. See [Privacy](#/help/privacy).' },
      {
        t: 'steps',
        items: [
          '**Open your policy files.** Choose all the XML files of one policy set (base, localization, extensions and the relying party file), or one .zip. You can also start from a Microsoft starter pack to look around first.',
          '**Pick a user journey** in the list on the left. Each card in the middle is one orchestration step, in the order B2C runs them.',
          '**Select a step.** The panel on the right says in plain words when the step runs, what it does and which claims it adds or needs.',
          '**Change something.** Edit a precondition, a step or a technical profile. The site re-checks the whole policy after every change and says what changed: new problems, a step that now runs differently, a claim that is no longer available.',
          '**Export.** Open Menu and choose Export files as zip, then upload the files to your tenant in the Azure portal. Upload the base file first, then the extensions file, then the relying party file.',
        ],
      },
      { t: 'note', title: 'Before you upload', text: 'This site checks what it can read from the XML. It does not run your policy. Test every change in a non-production tenant first. See [Limitations](#/help/limitations).' },
    ],
  },
  {
    id: 'reading-the-flow',
    title: 'Reading the flow',
    summary: 'What each part of a step card and each mark means.',
    blocks: [
      {
        t: 'terms',
        items: [
          { term: 'Number badge', def: 'The order of the step (its OrderNumber).' },
          { term: 'Step type', def: 'What the step does, for example Claims exchange, Claims provider selection or Send claims (issue the token).' },
          { term: 'Run badge', def: 'Always runs, Runs in some cases or Never runs. This comes from the site analysing every path through the journey. See [How the analysis works](#/help/analysis).' },
          { term: 'File badge', def: 'The file that defines the step: Base, Localization, Extensions or RP (relying party).' },
          { term: 'Condition line', def: 'The preconditions of the step in plain words, for example "Skipped if objectId exists". Select it to edit.' },
          { term: 'Option buttons', def: 'On a provider selection step, the buttons the user can pick. A dashed outline is a sign-up link.' },
          { term: 'Exchange rows', def: 'The technical profile the step calls. "via Facebook" means it runs only when the user picked Facebook in the previous step.' },
          { term: 'Adds and Needs', def: 'How many claims the step puts into the claims bag, and how many it needs before it can run. Turn on "Show claims on every step" to list them on all cards.' },
        ],
      },
      {
        t: 'terms',
        items: [
          { term: 'Filled circle', def: 'The claim is in the claims bag at this point, on every path.' },
          { term: 'Half circle', def: 'The claim may or may not be there. It depends on the path or on data the site cannot know.' },
          { term: 'Empty circle', def: 'The claim is not in the claims bag.' },
        ],
      },
      { t: 'p', text: 'Use **Flow** for one step at a time and **Claims map** for a table of every claim against every step. The map is the quickest way to see where a claim first appears and which steps depend on it.' },
    ],
  },
  {
    id: 'preconditions',
    title: 'Preconditions explained',
    summary: 'How B2C decides to skip a step, and how this site writes it down.',
    blocks: [
      { t: 'p', text: 'A step can carry preconditions. B2C checks them in order before it runs the step. If one of them applies, the step is skipped. Each precondition tests a claim in the claims bag. See [Preconditions](https://learn.microsoft.com/en-us/azure/active-directory-b2c/userjourneys#preconditions) in the Microsoft documentation.' },
      {
        t: 'terms',
        items: [
          { term: 'ClaimsExist', def: 'Tests whether a claim is in the claims bag. With ExecuteActionsIf set to true, the step is skipped when the claim exists. With false, it is skipped when the claim is missing.' },
          { term: 'ClaimEquals', def: 'Tests whether a claim has a given value. A claim that is not in the claims bag does not match, so the precondition does nothing.' },
          { term: 'Skipped when any holds', def: 'The step is skipped as soon as any one precondition applies. It runs only when none apply.' },
          { term: 'Runs only when all hold', def: 'The same rule turned around. "Skip if A" and "Skip if B" together mean the step runs only when not A and not B.' },
        ],
      },
      { t: 'p', text: 'Because ClaimEquals ignores a missing claim, a condition such as "run only when mfaPreference is phone" needs two preconditions: skip if the claim is missing, then skip if it is not equal to the value. The editor writes that pair for you when you choose "equals" under **Run only when**.' },
      { t: 'p', text: 'Open the **Conditions** tab of a step for the full picture: each precondition as a sentence, both readings of the rule, which analysed scenarios each precondition decides, and a table of every combination of the claims it tests.' },
    ],
  },
  {
    id: 'claims-bag',
    title: 'The claims bag and scenarios',
    summary: 'Which claims exist at each step, and how to trace one case exactly.',
    blocks: [
      { t: 'p', text: 'The claims bag is the set of claims collected during the journey. Steps read claims from it as input and add claims to it as output. See [orchestration steps and the claims bag](https://learn.microsoft.com/en-us/azure/active-directory-b2c/custom-policy-overview#orchestration-steps).' },
      {
        t: 'terms',
        items: [
          { term: 'Present, maybe, missing', def: 'The three states shown for each claim before and after a step. "Maybe" is honest: on some paths the claim is there, on others it is not, or it depends on data the site cannot see.' },
          { term: 'Set by and why', def: 'The Claims tab of a step lists where each claim came from and, for a "maybe", which scenario leaves it out.' },
          { term: 'Scenario', def: 'A set of choices: which button the user picks, whether a claim exists, what value it has. With choices fixed, the analysis is exact for that case. Open the Scenario menu above the flow to choose.' },
          { term: 'Complete paths', def: 'When a journey has few enough paths, the Scenario menu lists them by name, such as "Facebook, no account found".' },
        ],
      },
      { t: 'p', text: 'Two behaviours from the Microsoft documentation are built in. A claim of the password type is available to the validation of its own page but is not carried to later steps. A DefaultValue is used only when the claim is not already set, unless AlwaysUseDefaultValue is true. See [self-asserted technical profiles](https://learn.microsoft.com/en-us/azure/active-directory-b2c/self-asserted-technical-profile#output-claims).' },
    ],
  },
  {
    id: 'analysis',
    title: 'How the analysis works',
    summary: 'What the site works out, how, and where it can be wrong.',
    blocks: [
      { t: 'note', title: 'This is the site\'s own reasoning', text: 'Run badges, "maybe" claims and "never runs" alerts come from this site reading your XML. They are not a Microsoft feature, and the site does not run your policy.' },
      { t: 'p', text: 'The analysis walks the journey one step at a time and tracks every claim as present, maybe or missing. When a step depends on something it cannot know (whether a claim exists, which button the user picks, which of several exchanges runs) it follows each possibility. Technical profiles are followed through their inclusions, input and output claims, claims transformations and validation technical profiles.' },
      { t: 'p', text: 'Branches that end up in the same state are merged as soon as no later step cares about the difference. That keeps long journeys fast: a journey with 44 steps and many optional claims is analysed in a fraction of a second.' },
      { t: 'p', text: 'If a journey still has too many different states at some step (more than 96), the site merges more aggressively and says so: the status bar shows "Analysis merges some branches". Results stay safe, but a claim can read "maybe" where it is certain. Choose a scenario to get exact answers for one case.' },
      {
        t: 'terms',
        items: [
          { term: 'What it cannot know', def: 'What a REST API returns, whether a user exists in the directory, what the user types, and any behaviour that lives outside the XML.' },
          { term: 'Run it yourself', def: 'The final test is always a run in a test tenant. Use the Run now endpoint of the policy in the Azure portal, in a test tenant.' },
        ],
      },
    ],
  },
  {
    id: 'common-tasks',
    title: 'Common tasks',
    summary: 'Step-by-step recipes for the changes people make most.',
    blocks: [
      {
        t: 'terms',
        items: [
          { term: 'Add a step', def: 'Hover between two cards and select the plus button, or use the plus at the end of the flow. Choose the step type. The step is written to the file marked "Edits go here".' },
          { term: 'Skip a step in some cases', def: 'Select the step, open Conditions, and choose Add skip condition. Pick the claim and whether to skip when it exists, is missing or equals a value.' },
          { term: 'Change a technical profile from the base file', def: 'Do not edit the base file. Open the technical profile in the Library. A banner says changes are written to the extensions file as an override. You can pick another file under "Write changes to".' },
          { term: 'Copy a journey', def: 'Open a journey that lives in the base file and choose "Copy to" the extensions file. The copy gets a new Id and the relying party is pointed at it. This is the approach Microsoft recommends.' },
          { term: 'Rename a claim everywhere', def: 'Open the claim in the Library and rename it. Every reference in all loaded files is updated, and the checks run again.' },
          { term: 'Find where something is used', def: 'Open a claim, technical profile or transformation. The "Used by" sections list every step and profile that refers to it. Press Ctrl+K to jump to any item by name.' },
          { term: 'Reorder steps', def: 'Drag the handle at the left of a card. This works when all steps of the journey are in one file.' },
          { term: 'Undo a mistake', def: 'Press Ctrl+Z, or use the Undo button in the top bar. Deleting a step also offers Undo for a few seconds.' },
          { term: 'Edit raw XML', def: 'Switch to XML at the top. The visual views keep showing the last valid version of a file while the XML is broken, and the editor shows what is wrong.' },
        ],
      },
    ],
  },
  {
    id: 'inheritance',
    title: 'Files and inheritance',
    summary: 'How the base, extensions and relying party files fit together.',
    blocks: [
      { t: 'p', text: 'A custom policy is a chain of files. Each file declares the one it builds on in BasePolicy. The base file holds the standard building blocks, the extensions file holds your changes, and relying party files choose a user journey and the claims returned in the token. See the [inheritance model](https://learn.microsoft.com/en-us/azure/active-directory-b2c/custom-policy-overview#inheritance-model) and [best practices](https://learn.microsoft.com/en-us/azure/active-directory-b2c/custom-policy-overview#best-practices).' },
      { t: 'p', text: 'The top bar shows how many files make up the selected policy. Open that list to see the layers and which file receives your edits. New elements and overrides go to the extensions file by default, so the base file stays as Microsoft ships it.' },
    ],
  },
  {
    id: 'alerts',
    title: 'Understanding alerts',
    summary: 'What errors, warnings and information notes mean, and where their links lead.',
    blocks: [
      {
        t: 'terms',
        items: [
          { term: 'Error', def: 'B2C would reject the policy on upload, or the journey cannot work as written. Fix these first.' },
          { term: 'Warning', def: 'The policy is valid but something is probably wrong, for example a step that never runs or an input that may be missing.' },
          { term: 'Information', def: 'A note about something worth knowing, such as a placeholder left over from the starter pack.' },
        ],
      },
      { t: 'p', text: 'Every alert has **Why?**, which explains the rule and how to fix it, and **Learn more**, which opens the Microsoft Learn page that defines the rule. A button next to the alert applies the usual fix when there is one.' },
      { t: 'p', text: 'Alerts that come from the site\'s own analysis, such as "never runs" or "input may be missing", link to the Microsoft behaviour they rely on and to [How the analysis works](#/help/analysis), because they are conclusions of this site and not Microsoft rules.' },
      { t: 'p', text: 'Open all alerts from the counts in the top bar or from the status bar at the bottom. Select an alert to jump to the step, profile or claim it is about.' },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    summary: 'Move around without the mouse.',
    blocks: [
      {
        t: 'terms',
        items: [
          { term: 'Ctrl+K', def: 'Search journeys, steps, technical profiles, claims and transformations, and run actions. Use Cmd+K on a Mac.' },
          { term: 'Ctrl+Z', def: 'Undo the last change.' },
          { term: 'Ctrl+Shift+Z or Ctrl+Y', def: 'Redo.' },
          { term: 'Tab and Enter', def: 'Move between cards, buttons and list items, and open the one that has focus.' },
          { term: 'Esc', def: 'Close the search, a menu, the tour or an open panel.' },
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    summary: 'Where your files go (nowhere) and what is stored in your browser.',
    blocks: [
      {
        t: 'list',
        items: [
          'Your policy files are read and analysed in your browser. They are never sent to a server.',
          'The site makes no network requests while you work, apart from loading itself and the sample files you choose. Fonts and scripts are served from the same site. There is no analytics, no cookies and no sign-in.',
          'To keep your work between visits, the site saves your files in this browser (IndexedDB) and a few preferences such as the theme in local storage. Both stay on your device.',
          'Menu, Close workspace removes the saved copy. You can also clear this site\'s data in your browser settings.',
          '"Copy analysis report" puts text on your clipboard. It lists counts and timings only, never file names, identifiers, claim names or values. Nothing is sent anywhere.',
          'Links to Microsoft Learn open only when you select them.',
        ],
      },
      { t: 'p', text: 'This matters if your policy belongs to an employer. You can use the site without sharing the policy with anyone, including the people who maintain it.' },
    ],
  },
  {
    id: 'limitations',
    title: 'Limitations',
    summary: 'What this site does not do.',
    blocks: [
      {
        t: 'list',
        items: [
          'It reads and edits XML. It does not run your policy or contact your tenant. There is no upload to Azure from this site.',
          'The analysis is reasoning about the XML, not a simulation. REST API results, directory contents, user input and single sign-on sessions are unknown to it, and it shows them as "maybe".',
          'Very large journeys with many independent branches may be analysed in an approximate mode. The status bar says when. Choose a scenario for exact results.',
          'Only the parts of the policy language that the site understands are checked. Unusual or new features can be edited in XML but may not be validated.',
          'Not every technical profile type has a form. Use the XML view for the rest.',
          'It is made for laptops, desktops and tablets. On a phone-sized screen (under 768 pixels wide) the site shows a short message instead, with a link to open it on a larger screen.',
        ],
      },
    ],
  },
  {
    id: 'glossary',
    title: 'Glossary',
    summary: 'Terms used by the site and by Azure AD B2C.',
    blocks: [
      {
        t: 'terms',
        items: [
          { term: 'User journey', def: 'The ordered list of steps B2C runs to sign a user in, sign them up, reset a password or edit a profile.' },
          { term: 'Orchestration step', def: 'One step of a journey. B2C runs them in order, unless a precondition skips one.' },
          { term: 'Technical profile', def: 'A reusable definition of how to talk to something: a page, a directory, a REST API, an identity provider or a token issuer.' },
          { term: 'Claim', def: 'A named piece of data, such as email or objectId, defined in the claims schema with a data type.' },
          { term: 'Claims bag', def: 'The claims collected so far during one run of a journey.' },
          { term: 'Claims transformation', def: 'A small function that builds new claims from existing ones, for example joining strings or comparing two values.' },
          { term: 'Precondition', def: 'A test on the claims bag that can skip a step.' },
          { term: 'Relying party', def: 'The policy file that your application calls. It chooses the journey and the claims returned in the token.' },
          { term: 'Content definition', def: 'Connects a page to an HTML template that B2C shows to the user.' },
          { term: 'Scenario', def: 'In this site, a set of choices that fixes one path through a journey so the analysis is exact for it.' },
          { term: 'Override', def: 'A definition in the extensions file that replaces or extends the same Id in the base file.' },
        ],
      },
    ],
  },
  {
    id: 'faq',
    title: 'Questions and troubleshooting',
    summary: 'Answers to the things people ask first.',
    blocks: [
      {
        t: 'terms',
        items: [
          { term: 'My journey has many steps and the analysis says it merges branches.', def: 'That is expected for large journeys with many optional claims. Pick a scenario for an exact answer. If it also feels slow, use Menu, Copy analysis report and share the text. It contains no identifiers.' },
          { term: 'Why does a claim show "maybe"?', def: 'Some paths set it and others do not, or it comes from something the site cannot see, such as a REST response. Select the step, open Claims, and read the "Set by and why" column.' },
          { term: 'The step says it never runs, but I think it does.', def: 'Open Conditions. Check each precondition: remember that any one of them skips the step, and that ClaimEquals ignores a missing claim. Then choose a scenario to see the exact case.' },
          { term: 'I closed the tab. Is my work gone?', def: 'No. The site saves in this browser and restores it when you return. Export a zip for a safe copy.' },
          { term: 'Can I use this on a policy from my employer?', def: 'Yes. The files stay on your device. See [Privacy](#/help/privacy).' },
          { term: 'The page is blank or looks broken.', def: 'Reload the page. If it persists, clear this site\'s data in your browser and open your files again. Report a problem from the About section below.' },
        ],
      },
    ],
  },
  {
    id: 'about',
    title: 'About',
    summary: 'Version, license and where to send feedback.',
    blocks: [
      { t: 'p', text: 'B2C policy editor is an open source tool, licensed under the MIT license. The source and the issue tracker are at [github.com/anchitm06/adb2c-custom-policy-editor](https://github.com/anchitm06/adb2c-custom-policy-editor). Bug reports and ideas are welcome there. Please do not paste policy contents into an issue.' },
      { t: 'p', text: 'It is not affiliated with or endorsed by Microsoft. Azure AD B2C is a Microsoft product. The starter packs bundled for trying the site come from the [Azure-Samples starter pack](https://github.com/Azure-Samples/active-directory-b2c-custom-policy-starterpack) (MIT license, Copyright Microsoft Corporation). The design follows the Cobalt theme of [Hallmark](https://github.com/Nutlope/hallmark).' },
      { t: 'note', title: 'About Azure AD B2C', text: 'Since 1 May 2025, Azure AD B2C is no longer available to purchase for new customers. Existing customers can continue to use it. See the [Microsoft announcement](https://learn.microsoft.com/en-us/azure/active-directory-b2c/faq#azure-ad-b2c-end-of-sale).' },
    ],
  },
];
