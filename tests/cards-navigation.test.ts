import {describe, expect, it} from 'vitest';
import {readReturnPath} from '../src/cards/navigation';
describe('山行卡返回工具', () => {
  it('returns to a known tool and planner without forwarding other state', () => {
    const value = '/?layer=weather&plan=1&rain=ncdr-mpas&secret=discard#fragment';
    expect(readReturnPath(`?return=${encodeURIComponent(value)}`)).toBe('/?layer=weather&plan=1&rain=ncdr-mpas');
  });
  it.each(['https://example.com/', '//example.com/', '/cards.html', '/\\example.com/', 'javascript:alert(1)'])('rejects external and non-tool targets: %s', value => {
    expect(readReturnPath(`?return=${encodeURIComponent(value)}`)).toBe('/');
  });
  it('uses the tool home for missing or unrecognized parameters', () => {
    expect(readReturnPath('')).toBe('/');
    expect(readReturnPath('?return=%2F%3Flayer%3Dinvalid%26plan%3D2%26rain%3Dunknown')).toBe('/');
  });
});
