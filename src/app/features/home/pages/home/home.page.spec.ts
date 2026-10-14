import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { HomePage } from './home.page';

const WHATSAPP_PREFIX = 'https://wa.me/573108019222?text=';
const APP_MESSAGE = 'Hola YEP, quiero la app de YEP para mi celular';
const NOTIFYER_MESSAGE =
  'Hola YEP, quiero el notificador YEP Notifyer para el celular de mi negocio';
const APP_POST_URL = 'https://yaestapago.co/blog/app-movil-yep';
const NOTIFYER_POST_URL = 'https://yaestapago.co/blog/yep-notifyer-nueva-version';
const BLOG_URL = 'https://yaestapago.co/blog';

function whatsappMessage(link: HTMLAnchorElement): string {
  const href = link.getAttribute('href') ?? '';
  expect(href.startsWith(WHATSAPP_PREFIX)).toBe(true);
  return decodeURIComponent(href.slice(WHATSAPP_PREFIX.length));
}

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

  function newsCard(): HTMLElement {
    return compiled.querySelector('yep-card.home-news') as HTMLElement;
  }

  it('shows the YEP app as the featured novelty', () => {
    const banner = featuredBanner();

    expect(banner.querySelector('.yep-banner__eyebrow')?.textContent?.trim()).toBe(
      'Novedad · App móvil',
    );
    expect(banner.querySelector('.yep-banner__title')?.textContent?.trim()).toBe(
      'La app de YEP llega a tu celular',
    );
  });

  it('gives the featured novelty a primary action to WhatsApp and a secondary link to its post', () => {
    const actions = featuredBanner().querySelectorAll<HTMLAnchorElement>('a.yep-button');

    expect(actions.length).toBe(2);
    const [whatsapp, readMore] = Array.from(actions);

    expect(whatsapp.classList).toContain('yep-button--primary');
    expect(whatsapp.textContent?.trim()).toBe('Pídela por WhatsApp');
    expect(whatsappMessage(whatsapp)).toBe(APP_MESSAGE);
    expect(whatsapp.getAttribute('target')).toBe('_blank');
    expect(whatsapp.getAttribute('rel')).toContain('noopener');

    expect(readMore.classList).toContain('yep-button--secondary');
    expect(readMore.textContent?.trim()).toBe('Leer la nota');
    expect(readMore.getAttribute('href')).toBe(APP_POST_URL);
    expect(readMore.getAttribute('target')).toBe('_blank');
    expect(readMore.getAttribute('rel')).toContain('noopener');
  });

  it('lists YEP Notifyer first under "Más novedades" with WhatsApp and its unlisted post', () => {
    const first = newsCard().querySelector('.home-news__item') as HTMLElement;

    expect(first.querySelector('.home-news__title')?.textContent?.trim()).toBe(
      'YEP Notifyer estrena imagen',
    );
    const links = first.querySelectorAll<HTMLAnchorElement>('a.home-news__action');
    expect(links.length).toBe(2);
    expect(links[0].textContent?.trim()).toBe('Pídela por WhatsApp');
    expect(whatsappMessage(links[0])).toBe(NOTIFYER_MESSAGE);
    expect(links[1].textContent?.trim()).toBe('Leer la nota');
    expect(links[1].getAttribute('href')).toBe(NOTIFYER_POST_URL);
  });

  it('keeps the August novelties under "Más novedades" and links to the blog', () => {
    const card = newsCard();
    const titles = Array.from(card.querySelectorAll('.home-news__title')).map((el) =>
      el.textContent?.trim(),
    );

    expect(titles.length).toBe(7);
    expect(titles[1]).toBe('Un panel de pagos más claro');
    expect(titles).not.toContain('La app de YEP llega a tu celular');

    const blogLink = card.querySelector<HTMLAnchorElement>('a.home-link[slot="actions"]');
    expect(blogLink?.textContent?.trim()).toBe('Ver el blog');
    expect(blogLink?.getAttribute('href')).toBe(BLOG_URL);
  });
});
