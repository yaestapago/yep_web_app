import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { AssistantChatService } from '../../../assistant/services/assistant-chat.service';
import { HomePage } from './home.page';

const WHATSAPP_PREFIX = 'https://wa.me/573108019222?text=';
const APP_MESSAGE = 'Hola YEP, quiero la app de YEP para mi celular';
const APP_POST_URL = 'https://yaestapago.co/blog/app-movil-yep';
const BLOG_URL = 'https://yaestapago.co/blog';

function whatsappMessage(link: HTMLAnchorElement): string {
  const href = link.getAttribute('href') ?? '';
  expect(href.startsWith(WHATSAPP_PREFIX)).toBe(true);
  return decodeURIComponent(href.slice(WHATSAPP_PREFIX.length));
}

describe('HomePage novedades', () => {
  let compiled: HTMLElement;
  let chatOpen: ReturnType<typeof signal<boolean>>;
  let isSupportUser: ReturnType<typeof signal<boolean>>;

  async function render() {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
    return fixture;
  }

  beforeEach(async () => {
    chatOpen = signal(false);
    isSupportUser = signal(false);
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
            isSupportUser,
          },
        },
        {
          provide: AssistantChatService,
          useValue: { open: chatOpen, toggle: () => chatOpen.update((open) => !open) },
        },
      ],
    }).compileComponents();
  });

  function featuredBanner(): HTMLElement {
    return compiled.querySelector('yep-banner') as HTMLElement;
  }

  function newsCard(): HTMLElement {
    return compiled.querySelector('yep-card.home-news') as HTMLElement;
  }

  it('presenta a Zaira como la novedad principal', async () => {
    await render();
    const banner = featuredBanner();

    expect(banner.querySelector('.yep-banner__eyebrow')?.textContent?.trim()).toBe(
      'Novedad · Asistente virtual',
    );
    expect(banner.querySelector('.yep-banner__title')?.textContent?.trim()).toBe(
      'Conoce a Zaira, tu asistente en YEP',
    );
  });

  it('"Pregúntale a Zaira" abre el chat', async () => {
    const fixture = await render();
    const button = featuredBanner().querySelector('yep-button button') as HTMLButtonElement;

    expect(button.textContent?.trim()).toBe('Pregúntale a Zaira');
    button.click();
    fixture.detectChanges();
    expect(chatOpen()).toBe(true);
  });

  it('el rol support no ve el botón de Zaira', async () => {
    isSupportUser.set(true);
    await render();
    expect(featuredBanner().querySelector('yep-button')).toBeNull();
  });

  it('deja la app de YEP de primera en "Más novedades", con WhatsApp y su nota', async () => {
    await render();
    const first = newsCard().querySelector('.home-news__item') as HTMLElement;

    expect(first.querySelector('.home-news__title')?.textContent?.trim()).toBe(
      'La app de YEP llega a tu celular',
    );
    const links = first.querySelectorAll<HTMLAnchorElement>('a.home-news__action');
    expect(links.length).toBe(2);
    expect(links[0].textContent?.trim()).toBe('Pídela por WhatsApp');
    expect(whatsappMessage(links[0])).toBe(APP_MESSAGE);
    expect(links[1].textContent?.trim()).toBe('Leer la nota');
    expect(links[1].getAttribute('href')).toBe(APP_POST_URL);
  });

  it('mantiene las novedades anteriores en "Más novedades" y el enlace al blog', async () => {
    await render();
    const card = newsCard();
    const titles = Array.from(card.querySelectorAll('.home-news__title')).map((el) =>
      el.textContent?.trim(),
    );

    expect(titles.length).toBe(8);
    expect(titles[1]).toBe('YEP Notifyer estrena imagen');
    expect(titles).not.toContain('Conoce a Zaira, tu asistente en YEP');

    const blogLink = card.querySelector<HTMLAnchorElement>('a.home-link[slot="actions"]');
    expect(blogLink?.textContent?.trim()).toBe('Ver el blog');
    expect(blogLink?.getAttribute('href')).toBe(BLOG_URL);
  });
});
