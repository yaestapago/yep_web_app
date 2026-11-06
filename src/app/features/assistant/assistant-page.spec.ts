import { assistantPageFromUrl, isAssistantPageKey } from './assistant-page';

describe('assistantPageFromUrl', () => {
  it.each([
    ['/home', 'home'],
    ['/settings', 'settings'],
    ['/subscription?plan=pro', 'subscription'],
    ['/invoices#vencidas', 'invoices'],
    ['/businesses', 'businesses'],
    ['/businesses/abc123/notifiers', 'notifiers'],
    ['/businesses/abc123/notification-routing?x=1', 'notification-routing'],
    ['/businesses/abc123/dashboard/', 'dashboard'],
    ['/businesses/abc123/blocked', 'blocked'],
  ])('%s → %s', (url, page) => {
    expect(assistantPageFromUrl(url)).toBe(page);
  });

  it.each(['/', '/login', '/__ops/assistant', '/businesses/abc123/insights', '/businesses/abc123'])(
    '%s no se manda',
    (url) => {
      expect(assistantPageFromUrl(url)).toBeUndefined();
    },
  );

  it('solo reconoce claves propias, no lo heredado de Object', () => {
    expect(isAssistantPageKey('notifiers')).toBe(true);
    expect(isAssistantPageKey('constructor')).toBe(false);
    expect(isAssistantPageKey(3)).toBe(false);
  });
});
