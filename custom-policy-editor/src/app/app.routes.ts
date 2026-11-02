import { Routes } from '@angular/router';

/**
 * Only Help is a page of its own. Every other address is a deep link into the editor (a journey,
 * a step, a library item), which `DeepLinks` reads and writes; those routes render nothing.
 */
export const routes: Routes = [
  { path: 'help', loadComponent: () => import('./features/help/help-page').then((m) => m.HelpPage) },
  { path: 'help/:section', loadComponent: () => import('./features/help/help-page').then((m) => m.HelpPage) },
  { path: '**', children: [] },
];
