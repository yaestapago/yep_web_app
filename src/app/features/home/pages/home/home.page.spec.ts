import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { HomePage } from './home.page';

const WHATSAPP_PREFIX = 'https://wa.me/573108019222?text=';
const NOTIFYER_MESSAGE =
  'Hola YEP, quiero el notificador YEP Notifyer para el celular de mi negocio';
const AUGUST_POST_URL = 'https://yaestapago.co/blog/novedades-agosto-2026';

describe('HomePage novedades', () => {
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionService,
          useValue: {
            user: signal({ firstName: 'Ana' }),
            activeBusinessAccountId: signal('biz-1'),
            activeMembership: signal({ businessAccountId: 'biz-1', role: 'account_owner' }),
            isSuperUser: signal(false),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  function featuredBanner(): HTMLElement {
    return compiled.querySelector('yep-banner') as HTMLElement;
  }

  it('shows YEP Notifyer as the featured novelty', () => {
    const banner = featuredBanner();

    expect(banner.querySelector('.yep-banner__eyebrow')?.textContent?.trim()).toBe(
      'Novedad · Notificadores',
    );
    expect(banner.querySelector('.yep-banner__title')?.textContent?.trim()).toBe(
      'YEP Notifyer estrena imagen',
    );
  });

  it('gives the featured novelty a single primary action to WhatsApp with a ready message', () => {
    const actions = featuredBanner().querySelectorAll<HTMLAnchorElement>('a.yep-button');

    expect(actions.length).toBe(1);
    const action = actions[0];
    expect(action.classList).toContain('yep-button--primary');
    expect(action.textContent?.trim()).toBe('Pídela por WhatsApp');
    expect(action.getAttribute('href')?.startsWith(WHATSAPP_PREFIX)).toBe(true);
    expect(decodeURIComponent(action.getAttribute('href')!.slice(WHATSAPP_PREFIX.length))).toBe(
      NOTIFYER_MESSAGE,
    );
    expect(action.getAttribute('target')).toBe('_blank');
    expect(action.getAttribute('rel')).toContain('noopener');
  });

  it('does not link the featured novelty to the blog (its post is still a draft)', () => {
    const blogLinks = featuredBanner().querySelectorAll('a[href*="yaestapago.co/blog"]');

    expect(blogLinks.length).toBe(0);
  });

  it('keeps the August novelties under "Más novedades" with the link to their blog post', () => {
    const card = compiled.querySelector('yep-card.home-news') as HTMLElement;
    const titles = Array.from(card.querySelectorAll('.home-news__title')).map((el) =>
      el.textContent?.trim(),
    );

    expect(titles.length).toBe(6);
    expect(titles[0]).toBe('Un panel de pagos más claro');
    expect(titles).not.toContain('YEP Notifyer estrena imagen');

    const blogLink = card.querySelector<HTMLAnchorElement>('a.home-link[target="_blank"]');
    expect(blogLink?.textContent?.trim()).toBe('Leer en el blog');
    expect(blogLink?.getAttribute('href')).toBe(AUGUST_POST_URL);
  });
});
