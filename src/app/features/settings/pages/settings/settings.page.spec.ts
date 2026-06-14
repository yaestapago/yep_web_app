import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { SettingsPage } from './settings.page';

describe('SettingsPage notifications accordion', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Hidratación inicial del perfil (ngOnInit -> authApi.me()).
    httpMock.match(`${environment.apiUrl}/auth/me`).forEach((req) =>
      req.flush({ user: null, memberships: [] }),
    );
    httpMock.verify();
    localStorage.clear();
  });

  it('starts closed and shows the toggles only when expanded', () => {
    const fixture = TestBed.createComponent(SettingsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const header = compiled.querySelector('.accordion-header');

    expect(component.notificationsOpen()).toBe(false);
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(compiled.querySelector('#notifications-panel')).toBeNull();

    (header as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.notificationsOpen()).toBe(true);
    expect(header?.getAttribute('aria-expanded')).toBe('true');
    expect(compiled.querySelector('#notifications-panel')).not.toBeNull();
  });

  it('does not render the commented-out transaction/security alert toggles', () => {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.componentInstance.notificationsOpen.set(true);
    fixture.detectChanges();

    const keys = fixture.componentInstance.notificationToggles.map((toggle) => toggle.key);
    expect(keys).not.toContain('transactionAlerts');
    expect(keys).not.toContain('securityAlerts');
  });
});
