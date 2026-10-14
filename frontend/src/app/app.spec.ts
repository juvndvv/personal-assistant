import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import { App } from './app';

@Component({ template: '<p>Inicio</p>' })
class HomeStub {}

@Component({ template: '<p>Acceso</p>' })
class LoginStub {}

async function setup() {
  let releaseGuard: (decision: boolean | UrlTree) => void = () => undefined;
  const guardDecision = new Promise<boolean | UrlTree>((resolve) => {
    releaseGuard = resolve;
  });
  await render(App, {
    providers: [
      provideRouter([
        { path: 'login', component: LoginStub },
        { path: '', canActivate: [() => guardDecision], component: HomeStub },
      ]),
    ],
  });
  const navigation = TestBed.inject(Router).navigateByUrl('/');
  return { navigation, releaseGuard };
}

describe('App', () => {
  it('shows the boot splash while the first navigation is pending', async () => {
    await setup();

    expect(await screen.findByTestId('boot-splash')).toHaveTextContent('Cargando Finanzas…');
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument();
  });

  it('hides the boot splash once the first navigation completes', async () => {
    const { navigation, releaseGuard } = await setup();

    releaseGuard(true);
    await navigation;

    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument();
  });

  it('hides the boot splash when the first navigation is rejected', async () => {
    const { navigation, releaseGuard } = await setup();

    releaseGuard(false);
    await navigation;

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument());
  });

  it('keeps the boot splash until a redirect lands on its destination', async () => {
    const { navigation, releaseGuard } = await setup();

    releaseGuard(TestBed.inject(Router).parseUrl('/login'));
    await navigation;

    expect(await screen.findByText('Acceso')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument());
  });
});
