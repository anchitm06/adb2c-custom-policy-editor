import { computed, effect, Injectable, signal, untracked } from '@angular/core';
import { analyzeJourney, JourneyAnalysis } from '../core/analysis/journey-analyzer';
import { computeImpact, Impact } from '../core/analysis/impact';
import { applyToText, FileMutation } from '../core/edit/apply';
import { addClaimType, copyJourneyXml, EditError, ensureTechnicalProfileOverride, renameInDocument, RenameKind, renumberStepsAt, setAttribute } from '../core/edit/commands';
import { attr, child, elementAt, pathOf, serializeElement, setAttr, XDocument } from '../core/xml/xml';
import { idKey, SourceRef } from '../core/model/types';
import { buildChains, EffectivePolicy, layerLabel, PolicyChain, resolveChain } from '../core/resolve/resolve';
import { countBySeverity, Diagnostic, QuickFix, validateChain, validateFile } from '../core/validate/validate';
import { newFileId, ParsedFile, parseFile, PolicyFile, sortByInheritance } from '../core/workspace/workspace';
import { loadWorkspace, readPref, saveWorkspace, writePref } from './persistence';

export type View =
  | 'journeys'
  | 'technicalProfiles'
  | 'claims'
  | 'transformations'
  | 'contentDefinitions'
  | 'localization'
  | 'displayControls'
  | 'predicates'
  | 'relyingParty'
  | 'files';

export type Selection =
  | { kind: 'step'; journeyId: string; stepKey: string }
  | { kind: 'journey'; id: string }
  | { kind: 'technicalProfile'; id: string }
  | { kind: 'claim'; id: string }
  | { kind: 'transformation'; id: string }
  | { kind: 'contentDefinition'; id: string }
  | { kind: 'localization'; id: string }
  | { kind: 'displayControl'; id: string }
  | { kind: 'predicate'; id: string }
  | { kind: 'relyingParty' }
  | { kind: 'file'; id: string; line?: number }
  | null;

interface HistoryEntry {
  label: string;
  files: PolicyFile[];
}

export interface Toast {
  id: number;
  kind: 'impact' | 'error' | 'info';
  title: string;
  lines: string[];
  impact?: Impact;
}

@Injectable({ providedIn: 'root' })
export class EditorStore {
  // ------------------------------------------------------------------ source state
  readonly files = signal<PolicyFile[]>([]);
  readonly workspaceName = signal('Untitled workspace');
  readonly loaded = signal(false);
  readonly activeLeafId = signal<string | null>(null);
  readonly targetFileIdPref = signal<string | null>(null);
  readonly activeJourneyIdPref = signal<string | null>(null);
  readonly view = signal<View>('journeys');
  readonly selection = signal<Selection>(null);
  readonly selectedPath = signal<number | null>(null);
  readonly xmlFileId = signal<string | null>(null);
  readonly mainMode = signal<'visual' | 'xml'>('visual');
  readonly bottomTab = signal<'problems' | 'claims' | 'timeline'>('claims');
  readonly bottomOpen = signal(true);
  readonly inspectorTab = signal<'step' | 'pre' | 'claims' | 'xml'>('step');
  readonly theme = signal<'light' | 'dark' | 'system'>((readPref('theme') as 'light' | 'dark' | 'system') ?? 'system');

  private readonly undoStack = signal<HistoryEntry[]>([]);
  private readonly redoStack = signal<HistoryEntry[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly undoLabel = computed(() => this.undoStack().at(-1)?.label ?? '');
  readonly redoLabel = computed(() => this.redoStack().at(-1)?.label ?? '');

  readonly toasts = signal<Toast[]>([]);
  /** Steps changed by the last edit, highlighted for a few seconds. */
  readonly changedSteps = signal<Set<string>>(new Set());
  private toastSeq = 0;

  // ------------------------------------------------------------------ derived state
  private parseCache = new Map<string, ParsedFile>();
  private lastGood = new Map<string, ParsedFile>();

  /**
   * Parsed files. While a file has an XML error (for example mid-typing in the XML view) the last
   * well-formed version keeps driving the visual views; the error is still reported.
   */
  readonly parsed = computed<ParsedFile[]>(() => {
    const next = new Map<string, ParsedFile>();
    const out = this.files().map((f) => {
      const cached = this.parseCache.get(f.id);
      let p = cached && cached.text === f.text && cached.name === f.name ? cached : parseFile(f);
      if (p.doc) this.lastGood.set(f.id, p);
      else {
        const good = this.lastGood.get(f.id);
        if (good) p = { ...p, xdoc: good.xdoc, doc: good.doc };
      }
      next.set(f.id, p);
      return p;
    });
    this.parseCache = next;
    for (const id of [...this.lastGood.keys()]) if (!next.has(id)) this.lastGood.delete(id);
    return out;
  });

  readonly docs = computed(() => this.parsed().flatMap((f) => (f.doc ? [f.doc] : [])));
  readonly chains = computed<PolicyChain[]>(() => buildChains(this.docs()));
  readonly relyingPartyChains = computed(() => this.chains().filter((c) => c.leaf.relyingParty));

  readonly activeChain = computed<PolicyChain | null>(() => {
    const chains = this.chains();
    if (!chains.length) return null;
    const id = this.activeLeafId();
    const found = chains.find((c) => c.leaf.fileId === id);
    if (found) return found;
    const rp = chains.filter((c) => c.leaf.relyingParty);
    return rp.find((c) => /signup.?or.?signin|signup_signin/i.test(c.leaf.fileName + (c.leaf.policyId ?? ''))) ?? rp[0] ?? chains[0];
  });

  readonly eff = computed<EffectivePolicy | null>(() => {
    const c = this.activeChain();
    return c ? resolveChain(c) : null;
  });

  readonly journeyIds = computed(() => {
    const e = this.eff();
    return e ? [...e.userJourneys.values()].map((j) => j.id) : [];
  });

  readonly activeJourneyId = computed<string | null>(() => {
    const e = this.eff();
    if (!e) return null;
    const pref = this.activeJourneyIdPref();
    if (pref && (e.userJourneys.has(idKey(pref)) || e.subJourneys.has(idKey(pref)))) return e.userJourneys.get(idKey(pref))?.id ?? e.subJourneys.get(idKey(pref))!.id;
    const def = e.relyingParty?.defaultUserJourney?.referenceId;
    if (def && e.userJourneys.has(idKey(def))) return e.userJourneys.get(idKey(def))!.id;
    return [...e.userJourneys.values()][0]?.id ?? null;
  });

  readonly activeJourney = computed(() => {
    const e = this.eff();
    const id = this.activeJourneyId();
    if (!e || !id) return null;
    return e.userJourneys.get(idKey(id))?.value ?? e.subJourneys.get(idKey(id))?.value ?? null;
  });

  readonly analysis = computed<JourneyAnalysis | null>(() => {
    const e = this.eff();
    const id = this.activeJourneyId();
    return e && id ? analyzeJourney(e, id) : null;
  });

  /** Analysis of the relying party's default journey (validated even when another journey is open). */
  private readonly defaultAnalysis = computed<JourneyAnalysis | null>(() => {
    const e = this.eff();
    const def = e?.relyingParty?.defaultUserJourney?.referenceId;
    const cur = this.analysis();
    if (!e || !def) return null;
    if (cur && idKey(cur.journeyId) === idKey(def)) return cur;
    return e.userJourneys.has(idKey(def)) ? analyzeJourney(e, def) : null;
  });

  readonly diagnostics = computed<Diagnostic[]>(() => {
    const files = this.parsed();
    const out: Diagnostic[] = [];
    for (const f of files) out.push(...validateFile(f, files));
    const e = this.eff();
    if (e) {
      const analyses = [this.analysis(), this.defaultAnalysis()].filter((a, i, arr): a is JourneyAnalysis => !!a && arr.indexOf(a) === i);
      out.push(...validateChain(e, analyses));
    }
    const rank = { error: 0, warning: 1, info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  });

  readonly counts = computed(() => countBySeverity(this.diagnostics()));

  /** Diagnostics grouped by step key for badges. */
  readonly diagnosticsByStep = computed(() => {
    const m = new Map<string, Diagnostic[]>();
    for (const d of this.diagnostics()) {
      if (d.target?.kind !== 'step') continue;
      const list = m.get(d.target.id) ?? [];
      list.push(d);
      m.set(d.target.id, list);
    }
    return m;
  });

  readonly diagnosticsByTarget = computed(() => {
    const m = new Map<string, Diagnostic[]>();
    for (const d of this.diagnostics()) {
      if (!d.target) continue;
      const k = `${d.target.kind}:${idKey(d.target.id)}`;
      const list = m.get(k) ?? [];
      list.push(d);
      m.set(k, list);
    }
    return m;
  });

  /** File that new elements and overrides are written to (Extensions by default). */
  readonly targetFile = computed(() => {
    const chain = this.activeChain();
    if (!chain) return null;
    const pref = this.targetFileIdPref();
    const inChain = chain.docs.find((d) => d.fileId === pref);
    if (inChain) return inChain;
    return chain.docs.find((d) => layerLabel(chain, d.fileId) === 'Extensions') ?? chain.docs[chain.docs.length - 1];
  });

  readonly fileById = computed(() => new Map(this.parsed().map((f) => [f.id, f])));

  constructor() {
    // Persist the workspace (debounced).
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const files = this.files();
      const leaf = this.activeLeafId();
      const target = this.targetFileIdPref();
      const name = this.workspaceName();
      if (!untracked(this.loaded)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void saveWorkspace({ name, files, activeLeafId: leaf, targetFileId: target, savedAt: Date.now() }), 400);
    });
    effect(() => {
      const t = this.theme();
      writePref('theme', t);
      if (typeof document !== 'undefined') {
        if (t === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', t);
      }
    });
  }

  async restore(): Promise<void> {
    const ws = await loadWorkspace();
    if (ws?.files?.length) {
      this.files.set(ws.files);
      this.workspaceName.set(ws.name || 'Workspace');
      this.activeLeafId.set(ws.activeLeafId ?? null);
      this.targetFileIdPref.set(ws.targetFileId ?? null);
    }
    this.loaded.set(true);
  }

  // ------------------------------------------------------------------ workspace actions

  openFiles(files: { name: string; text: string }[], name?: string, replace = true): void {
    const list = files.map((f) => ({ id: newFileId(), name: f.name, text: f.text }));
    const parsed = sortByInheritance(list.map(parseFile));
    const ordered: PolicyFile[] = parsed.map(({ id, name: n, text }) => ({ id, name: n, text }));
    if (replace) {
      this.files.set(ordered);
      this.undoStack.set([]);
      this.redoStack.set([]);
      this.activeLeafId.set(null);
      this.targetFileIdPref.set(null);
      this.activeJourneyIdPref.set(null);
      this.selection.set(null);
      this.selectedPath.set(null);
      if (name) this.workspaceName.set(name);
    } else {
      this.pushHistory(`Import ${files.length} file${files.length > 1 ? 's' : ''}`);
      this.files.update((cur) => {
        const merged = [...cur];
        for (const f of ordered) {
          const i = merged.findIndex((m) => m.name === f.name);
          if (i >= 0) merged[i] = { ...f, id: merged[i].id };
          else merged.push(f);
        }
        return sortByInheritance(merged.map(parseFile)).map(({ id, name: n, text }) => ({ id, name: n, text }));
      });
    }
    this.view.set('journeys');
  }

  closeWorkspace(): void {
    this.files.set([]);
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.selection.set(null);
  }

  removeFile(id: string): void {
    this.pushHistory('Remove file');
    this.files.update((fs) => fs.filter((f) => f.id !== id));
  }

  renameFile(id: string, name: string): void {
    this.pushHistory('Rename file');
    this.files.update((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  addFile(name: string, text: string): string {
    const id = newFileId();
    this.pushHistory(`Add ${name}`);
    this.files.update((fs) => [...fs, { id, name, text }]);
    return id;
  }

  // ------------------------------------------------------------------ editing

  private pushHistory(label: string): void {
    this.undoStack.update((s) => [...s.slice(-199), { label, files: this.files() }]);
    this.redoStack.set([]);
  }

  /** Apply mutations to one or more files as a single undoable edit, then report the impact. */
  edit(label: string, mutations: FileMutation[], opts: { quiet?: boolean } = {}): boolean {
    if (!mutations.length) return false;
    const before = { diagnostics: this.diagnostics(), analysis: this.analysis() ?? undefined };
    const current = this.files();
    let next: PolicyFile[];
    try {
      next = current.map((f) => {
        const ms = mutations.filter((m) => m.fileId === f.id);
        if (!ms.length) return f;
        let text = f.text;
        for (const m of ms) text = applyToText(text, m.mutate);
        return text === f.text ? f : { ...f, text };
      });
    } catch (e) {
      const msg = e instanceof EditError ? e.message : `The edit could not be applied: ${(e as Error).message}`;
      this.toast({ kind: 'error', title: label, lines: [msg] });
      return false;
    }
    if (next.every((f, i) => f === current[i])) return false;
    this.undoStack.update((s) => [...s.slice(-199), { label, files: current }]);
    this.redoStack.set([]);
    this.files.set(next);
    this.reportImpact(label, before, opts.quiet);
    return true;
  }

  /** Replace the full text of a file (XML view). */
  setFileText(fileId: string, text: string, label = 'Edit XML'): void {
    const before = { diagnostics: this.diagnostics(), analysis: this.analysis() ?? undefined };
    const cur = this.files();
    const f = cur.find((x) => x.id === fileId);
    if (!f || f.text === text) return;
    const last = this.undoStack().at(-1);
    // Coalesce consecutive typing in the XML editor into one undo entry.
    if (!(last && last.label === label && label === 'Edit XML' && this.lastXmlEditFile === fileId)) {
      this.undoStack.update((s) => [...s.slice(-199), { label, files: cur }]);
    }
    this.lastXmlEditFile = fileId;
    this.redoStack.set([]);
    this.files.set(cur.map((x) => (x.id === fileId ? { ...x, text } : x)));
    this.reportImpact(label, before, true);
  }
  private lastXmlEditFile: string | null = null;

  undo(): void {
    const s = this.undoStack();
    const e = s.at(-1);
    if (!e) return;
    const before = { diagnostics: this.diagnostics(), analysis: this.analysis() ?? undefined };
    this.undoStack.set(s.slice(0, -1));
    this.redoStack.update((r) => [...r, { label: e.label, files: this.files() }]);
    this.files.set(e.files);
    this.lastXmlEditFile = null;
    this.reportImpact(`Undo: ${e.label}`, before);
  }

  redo(): void {
    const r = this.redoStack();
    const e = r.at(-1);
    if (!e) return;
    const before = { diagnostics: this.diagnostics(), analysis: this.analysis() ?? undefined };
    this.redoStack.set(r.slice(0, -1));
    this.undoStack.update((s) => [...s, { label: e.label, files: this.files() }]);
    this.files.set(e.files);
    this.lastXmlEditFile = null;
    this.reportImpact(`Redo: ${e.label}`, before);
  }

  private reportImpact(label: string, before: { diagnostics: Diagnostic[]; analysis?: JourneyAnalysis }, quiet = false): void {
    const after = { diagnostics: this.diagnostics(), analysis: this.analysis() ?? undefined };
    const impact = computeImpact(before, after);
    this.changedSteps.set(impact.changedSteps);
    setTimeout(() => {
      if (this.changedSteps() === impact.changedSteps) this.changedSteps.set(new Set());
    }, 4000);
    if (quiet && !impact.newDiagnostics.some((d) => d.severity === 'error')) return;
    this.toast({ kind: 'impact', title: label, lines: impact.lines.length ? impact.lines : ['No change to validation or claims flow'], impact });
  }

  toast(t: Omit<Toast, 'id'>): void {
    const id = ++this.toastSeq;
    this.toasts.update((ts) => [...ts.slice(-1), { ...t, id }]);
    const quiet = t.kind === 'impact' && !t.impact?.hasChanges;
    setTimeout(() => this.dismissToast(id), t.kind === 'error' ? 8000 : quiet ? 2500 : 6000);
  }

  dismissToast(id: number): void {
    this.toasts.update((ts) => ts.filter((t) => t.id !== id));
  }

  /** Copy the active journey to the target file under a new Id and make the relying party use it. */
  copyJourneyToTarget(): void {
    const j = this.activeJourney();
    const target = this.targetFile();
    const chain = this.activeChain();
    if (!j || !target || !chain) return;
    const src = this.fileById().get(j.ref.fileId)?.xdoc;
    const el = src ? elementAt(src.root, j.ref.path) : null;
    if (!el) return;
    const xml = serializeElement(el);
    const existing = new Set([...(this.eff()?.userJourneys.keys() ?? []), ...(this.eff()?.subJourneys.keys() ?? [])]);
    let newId = `${j.id}Custom`;
    for (let n = 2; existing.has(idKey(newId)); n++) newId = `${j.id}Custom${n}`;
    const leaf = chain.leaf;
    const repoint = leaf.relyingParty?.defaultUserJourney && idKey(leaf.relyingParty.defaultUserJourney.referenceId) === idKey(j.id);
    const muts: FileMutation[] = [{ fileId: target.fileId, mutate: (d) => copyJourneyXml(d, xml, newId) }];
    const repointMut = (d: Parameters<FileMutation['mutate']>[0]) => {
      const duj = child(child(d.root, 'RelyingParty'), 'DefaultUserJourney');
      if (duj && idKey(attr(duj, 'ReferenceId')) === idKey(j.id)) setAttr(duj, 'ReferenceId', newId);
    };
    if (repoint) {
      if (leaf.fileId === target.fileId) muts[0] = { fileId: target.fileId, mutate: (d) => (copyJourneyXml(d, xml, newId), repointMut(d)) };
      else muts.push({ fileId: leaf.fileId, mutate: repointMut });
    }
    if (this.edit(`Copy ${j.id} to ${target.fileName} as ${newId}`, muts)) this.openJourney(newId);
  }

  /** Rename an identifier and all references to it in every (well-formed) file. */
  renameEverywhere(kind: RenameKind, from: string, to: string): boolean {
    if (!to.trim() || from === to) return false;
    const muts = this.parsed()
      .filter((f) => f.doc)
      .map((f) => ({ fileId: f.id, mutate: (d: XDocument) => void renameInDocument(d, kind, from, to.trim()) }));
    return this.edit(`Rename ${from} to ${to.trim()}`, muts);
  }

  /** Per technical profile choice of where edits are written (file id). */
  readonly tpWritePref = signal<Record<string, string>>({});

  /**
   * File that edits of a technical profile go to. Following Microsoft's guidance, a profile
   * defined in Base is overridden in the target (Extensions) file instead of being edited in place.
   */
  tpWriteFile(tpId: string): string | null {
    const eff = this.eff();
    const chain = this.activeChain();
    const e = eff?.technicalProfiles.get(idKey(tpId));
    if (!eff || !chain || !e) return null;
    const pref = this.tpWritePref()[idKey(tpId)];
    if (pref && chain.docs.some((d) => d.fileId === pref)) return pref;
    const target = this.targetFile();
    const layerFiles = e.layers.map((l) => l.ref.fileId);
    if (target && layerFiles.includes(target.fileId)) return target.fileId;
    const first = chain.docs.findIndex((d) => d.fileId === layerFiles[0]);
    const ti = target ? chain.docs.findIndex((d) => d.fileId === target.fileId) : -1;
    if (target && ti > first) return target.fileId;
    return layerFiles[layerFiles.length - 1];
  }

  /** Edit a technical profile in its write file, creating an override element when needed. */
  editTp(tpId: string, label: string, fn: (doc: XDocument, tpRef: SourceRef) => void): boolean {
    const fileId = this.tpWriteFile(tpId);
    const e = this.eff()?.technicalProfiles.get(idKey(tpId));
    if (!fileId || !e) return false;
    const cp = e.value.claimsProvider || 'Claims provider';
    return this.edit(label, [
      {
        fileId,
        mutate: (d) => {
          const el = ensureTechnicalProfileOverride(d, e.id, cp);
          fn(d, { fileId, path: pathOf(el), line: el.line });
        },
      },
    ]);
  }

  applyFix(fix: QuickFix): void {
    switch (fix.kind) {
      case 'renumberSteps':
        this.edit(fix.label, [{ fileId: fix.journeyRef.fileId, mutate: (d) => renumberStepsAt(d, fix.journeyRef) }]);
        break;
      case 'addClaimType': {
        const t = this.targetFile();
        if (t) {
          this.edit(fix.label, [{ fileId: t.fileId, mutate: (d) => addClaimType(d, fix.claimId) }]);
          this.select({ kind: 'claim', id: fix.claimId });
        }
        break;
      }
      case 'setAttribute':
        this.edit(fix.label, [{ fileId: fix.ref.fileId, mutate: (d) => setAttribute(d, fix.ref, fix.name, fix.value) }]);
        break;
      default:
        break;
    }
  }

  /** Navigate to the element a diagnostic is about. */
  goTo(d: Diagnostic): void {
    const t = d.target;
    if (t) {
      switch (t.kind) {
        case 'step':
          this.select({ kind: 'step', journeyId: t.journeyId ?? t.id.split('#')[0], stepKey: t.id });
          return;
        case 'journey':
          this.openJourney(t.id);
          return;
        case 'technicalProfile':
        case 'claim':
        case 'transformation':
        case 'contentDefinition':
        case 'displayControl':
        case 'predicate':
          this.view.set(({ technicalProfile: 'technicalProfiles', claim: 'claims', transformation: 'transformations', contentDefinition: 'contentDefinitions', displayControl: 'displayControls', predicate: 'predicates' } as const)[t.kind]);
          this.mainMode.set('visual');
          this.selection.set({ kind: t.kind, id: t.id } as Selection);
          return;
        case 'relyingParty':
          this.view.set('relyingParty');
          this.mainMode.set('visual');
          this.selection.set({ kind: 'relyingParty' });
          return;
      }
    }
    if (d.ref) this.revealRef(d.ref);
  }

  // ------------------------------------------------------------------ navigation helpers

  select(sel: Selection): void {
    this.selection.set(sel);
    if (!sel) return;
    const views: Partial<Record<NonNullable<Selection>['kind'], View>> = {
      technicalProfile: 'technicalProfiles',
      claim: 'claims',
      transformation: 'transformations',
      contentDefinition: 'contentDefinitions',
      localization: 'localization',
      displayControl: 'displayControls',
      predicate: 'predicates',
      relyingParty: 'relyingParty',
      file: 'files',
    };
    if (sel.kind === 'step' || sel.kind === 'journey') {
      const jid = sel.kind === 'step' ? sel.journeyId : sel.id;
      const main = this.analysis()?.steps.has(sel.kind === 'step' ? sel.stepKey : '') ?? false;
      if (!main) this.activeJourneyIdPref.set(jid);
      this.view.set('journeys');
    } else if (views[sel.kind] && this.view() !== 'journeys') {
      this.view.set(views[sel.kind]!);
    }
  }

  openJourney(id: string): void {
    this.activeJourneyIdPref.set(id);
    this.selectedPath.set(null);
    this.view.set('journeys');
    this.mainMode.set('visual');
    this.selection.set({ kind: 'journey', id });
  }

  revealRef(ref: SourceRef): void {
    this.xmlFileId.set(ref.fileId);
    this.mainMode.set('xml');
    this.pendingReveal.set({ ...ref });
  }
  readonly pendingReveal = signal<SourceRef | null>(null);

  layerOf(fileId: string): string {
    const c = this.activeChain();
    if (c && c.docs.some((d) => d.fileId === fileId)) return layerLabel(c, fileId);
    const doc = this.fileById().get(fileId)?.doc;
    if (!doc) return '—';
    const other = this.chains().find((ch) => ch.docs.some((d) => d.fileId === fileId));
    return other ? layerLabel(other, fileId) : '—';
  }

  fileName(fileId: string): string {
    return this.files().find((f) => f.id === fileId)?.name ?? fileId;
  }
}
