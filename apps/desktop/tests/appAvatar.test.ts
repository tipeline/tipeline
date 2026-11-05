// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import AvatarWidget from '@/components/app/widgets/AvatarWidget.vue';
import AppAvatar from '@/components/app/widgets/AppAvatar.vue';
import TableWidget from '@/components/app/widgets/TableWidget.vue';
import { avatarColor, avatarPeople, initials, statusColor } from '@/utils/appAvatar';

const TEAM = [
  { name: 'Ada Lovelace', role: 'Engineering', status: 'online' },
  { name: 'Grace Hopper', role: 'Research', status: 'away', photo: 'https://example.org/grace.jpg' },
  { name: 'Alan Turing', role: 'Security' },
  { name: 'Katherine Johnson' },
  { email: 'margaret@example.org' },
  'Linus',
];

describe('avatar values', () => {
  it('initials from names and emails', () => {
    expect(['Ada Lovelace', 'grace', 'ada.lovelace@example.org', 'Mary Jane Watson', '  ', null, 'Ángel Núñez', '(Bob) Smith'].map(initials)).toEqual([
      'AL', 'G', 'AL', 'MW', '', '', 'ÁN', 'BS',
    ]);
  });
  it('a steady color per name (status words don’t matter); the asked-for color wins', () => {
    expect(avatarColor('Ada Lovelace')).toBe(avatarColor('Ada Lovelace'));
    expect(avatarColor('Ada', 'purple')).toBe('purple');
    expect(['online', 'away', 'busy', 'offline', '', 'failed'].map(statusColor)).toEqual(['green', 'amber', 'red', 'gray', null, 'red']);
  });
  it('people from rows by the usual keys, or the given ones; plain names too', () => {
    const people = avatarPeople(TEAM, { subtitleKey: 'role' });
    expect(people.map((p) => [p.name, p.subtitle, p.status ?? null])).toEqual([
      ['Ada Lovelace', 'Engineering', 'online'],
      ['Grace Hopper', 'Research', 'away'],
      ['Alan Turing', 'Security', null],
      ['Katherine Johnson', '', null],
      ['margaret@example.org', '', null],
      ['Linus', '', null],
    ]);
    expect(people[1].src).toBe('https://example.org/grace.jpg');
    expect(avatarPeople([{ who: 'X', pic: 'x.png' }], { nameKey: 'who', srcKey: 'pic' })[0]).toMatchObject({ name: 'X', src: 'x.png' });
  });
});

describe('AppAvatar', () => {
  const mountOne = (props: Record<string, unknown>) => mount(AppAvatar, { props, global: { plugins: [i18n] } });
  it('initials without a picture, the picture with one — and the initials again if it breaks', async () => {
    expect(mountOne({ name: 'Ada Lovelace' }).text()).toBe('AL');
    const w = mountOne({ name: 'Grace Hopper', src: 'https://example.org/grace.jpg', status: 'busy' });
    expect(w.get('img').attributes('src')).toBe('https://example.org/grace.jpg');
    expect(w.get('[data-testid="avatar-status"]').classes()).toContain('bg-red-500');
    await w.get('img').trigger('error');
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toBe('GH');
  });
});

describe('AvatarWidget', () => {
  const mountAvatar = (props: Record<string, unknown>) =>
    mount(AvatarWidget, { props: { props, componentId: 'team' }, global: { plugins: [i18n] }, attachTo: document.body });

  it('one person, with the name beside it; a click fires click', async () => {
    const w = mountAvatar({ name: 'Ada Lovelace', subtitle: 'Engineering', showName: true, status: 'online' });
    expect(w.get('[data-testid="avatar-one"]').text()).toContain('Ada Lovelace');
    expect(w.text()).toContain('Engineering');
    await w.get('[data-testid="avatar-one"]').trigger('click');
    expect(w.emitted('event')).toEqual([['click']]);
    w.unmount();
  });

  it('a group stacks up to max and says +N; a click picks the person', async () => {
    const w = mountAvatar({ data: TEAM, max: 3 });
    expect(w.findAll('[data-testid="avatar-stack"] [data-item]')).toHaveLength(3);
    expect(w.get('[data-testid="avatar-more"]').text()).toBe('+3');
    expect(w.get('[data-testid="avatar-more"]').attributes('title')).toBe('Katherine Johnson, margaret@example.org, Linus');
    await w.findAll('[data-item]')[1].trigger('click');
    expect(w.emitted('state')![0]).toEqual([{ selectedItem: TEAM[1], selectedIndex: 1 }]);
    expect(w.emitted('event')![0]).toEqual(['itemClick', { selectedItem: TEAM[1], selectedIndex: 1 }]);
    w.unmount();
  });

  it('display list: everyone, with names and subtitles', () => {
    const w = mountAvatar({ data: TEAM.slice(0, 3), display: 'list', subtitleKey: 'role', max: 1 });
    expect(w.findAll('[data-item]').map((b) => b.text())).toEqual(['ALAda LovelaceEngineering', 'Grace HopperResearch', 'ATAlan TuringSecurity']);
    w.unmount();
  });

  it('an empty group says so', () => {
    expect(mountAvatar({ data: [], emptyText: 'Nobody assigned' }).text()).toContain('Nobody assigned');
  });
});

describe('table column format: avatar', () => {
  it('the initials (or the row’s picture) and the name', () => {
    const w = mount(TableWidget, {
      props: {
        props: {
          data: [{ owner: 'Ada Lovelace' }, { owner: 'Grace Hopper', pic: 'https://example.org/g.jpg' }],
          columns: [{ key: 'owner', header: 'Owner', format: 'avatar', srcKey: 'pic' }],
        },
        componentId: 't',
      },
      global: { plugins: [i18n, createPinia()] },
    });
    const cells = w.findAll('tbody td');
    expect(cells[0].text()).toBe('ALAda Lovelace');
    expect(cells[1].get('img').attributes('src')).toBe('https://example.org/g.jpg');
    w.unmount();
  });
});
