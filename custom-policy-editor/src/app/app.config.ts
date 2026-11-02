import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  // Hash routing keeps every link working on GitHub Pages, which only serves the root page.
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withHashLocation(), withComponentInputBinding())],
};
