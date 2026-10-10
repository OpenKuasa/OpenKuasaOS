import { describe, expect, test } from 'vitest';
import {
  CONTACT_VIEWS,
  DEFAULT_FILTERS,
  SCORE_BANDS,
  UNASSIGNED,
  activeFilterCount,
  filterContacts,
  filterOptions,
  scoreBand,
  type ContactFilters,
  type ContactView,
} from '@/lib/crm/contact-filters';
import type { CrmContact } from '@/lib/crm/contacts';
import type { CrmFollowUp } from '@/lib/crm/follow-ups';

function contact(id: string, values: Partial<CrmContact>): CrmContact {
  return {
    id,
    email: `${id}@example.com`,
    company: 'Personal',
    first: id,
    last: '',
    phone: '',
    country: 'MY',
    status: 'New Leads',
    score: 0,
    pic: null,
    lastInteraction: null,
    ...values,
  };
}

const CONTACTS: CrmContact[] = [
  contact('aina', {
    first: 'Aina',
    last: 'Rahman',
    email: 'aina@kedai.my',
    company: 'Kedai Kopi',
    phone: '+6012-345 6789',
    country: 'MY',
    status: 'New Leads',
    score: 75,
    pic: 'Siti',
    tags: ['VIP', 'Wholesale'],
  }),
  contact('ben', {
    first: 'Ben',
    last: 'Tan',
    email: 'ben@harbour.sg',
    company: 'Harbour Trading',
    phone: '(65) 8123-4567',
    country: 'SG',
    status: 'Contacted',
    score: 74,
    pic: 'Amir',
    tags: ['vip'],
  }),
  contact('chandra', {
    first: 'Chandra',
    last: 'Wijaya',
    email: 'chandra@batik.id',
    company: 'Batik Nusantara',
    phone: '',
    country: 'ID',
    status: 'Qualified',
    score: 40,
    pic: null,
    tags: ['Retail'],
  }),
  contact('dewi', {
    first: 'Dewi',
    last: 'Lim',
    email: 'dewi@example.com',
    company: 'Personal',
    phone: '03 5555 0101',
    country: '—',
    status: 'Customer',
    score: 39,
    pic: 'Siti',
    tags: [],
  }),
  // A sample row: no `tags` field at all.
  contact('ed', {
    first: 'Ed',
    last: 'Old',
    email: 'ed@gone.my',
    company: 'Closed Shop',
    phone: '019-999 0000',
    country: 'MY',
    status: 'Archived',
    score: 90,
    pic: 'Amir',
  }),
  contact('farah', {
    first: 'Farah',
    last: 'Noor',
    email: 'farah@example.com',
    company: 'Noor Bakery',
    phone: '',
    country: 'MY',
    status: null,
    score: 10,
    pic: null,
    tags: ['wholesale', 'Bakery'],
  }),
  contact('gita', {
    first: 'Gita',
    last: 'Sari',
    email: 'gita@old.id',
    company: 'Sari Rasa',
    phone: '',
    country: 'ID',
    status: 'Archived',
    score: 55,
    pic: null,
    tags: ['Retail'],
  }),
];

function followUp(id: string, contactId: string, overdue: boolean): CrmFollowUp {
  return { id, contactId, title: 'Call back', due: overdue ? '1 Oct 2026' : null, overdue };
}

const FOLLOW_UPS: Record<string, CrmFollowUp[]> = {
  aina: [followUp('f1', 'aina', false)],
  ben: [followUp('f2', 'ben', false), followUp('f3', 'ben', true)],
};

const ALL: ContactFilters = { ...DEFAULT_FILTERS, view: 'all' };

/** Ids of the contacts kept, with view 'all' unless overridden. */
function ids(filters: Partial<ContactFilters>, followUps = FOLLOW_UPS) {
  return filterContacts(CONTACTS, followUps, { ...ALL, ...filters }).map((c) => c.id);
}

describe('constants', () => {
  test('views are listed in menu order with their labels', () => {
    expect(CONTACT_VIEWS).toEqual([
      { key: 'active', label: 'Active contacts' },
      { key: 'lead', label: 'New leads' },
      { key: 'contacted', label: 'Contacted' },
      { key: 'qualified', label: 'Qualified' },
      { key: 'customer', label: 'Customers' },
      { key: 'archived', label: 'Archived' },
      { key: 'all', label: 'All contacts' },
    ]);
  });

  test('score bands are listed hot, warm, cold; the warm label uses an en dash', () => {
    expect(SCORE_BANDS).toEqual([
      { key: 'hot', label: 'Hot (75+)' },
      { key: 'warm', label: 'Warm (40–74)' },
      { key: 'cold', label: 'Cold (<40)' },
    ]);
  });

  test('UNASSIGNED is the empty string', () => {
    expect(UNASSIGNED).toBe('');
  });

  test('DEFAULT_FILTERS is the active view with nothing else set', () => {
    expect(DEFAULT_FILTERS).toEqual({
      view: 'active',
      search: '',
      scores: [],
      pics: [],
      countries: [],
      tags: [],
      followUp: 'any',
    });
  });
});

describe('scoreBand', () => {
  test.each([
    [0, 'cold'],
    [39, 'cold'],
    [40, 'warm'],
    [74, 'warm'],
    [75, 'hot'],
    [100, 'hot'],
  ] as const)('%i is %s', (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe('filterContacts', () => {
  test('DEFAULT_FILTERS hides only archived contacts', () => {
    const kept = filterContacts(CONTACTS, FOLLOW_UPS, DEFAULT_FILTERS).map((c) => c.id);
    expect(kept).toEqual(['aina', 'ben', 'chandra', 'dewi', 'farah']);
  });

  test.each<[ContactView, string[]]>([
    ['all', ['aina', 'ben', 'chandra', 'dewi', 'ed', 'farah', 'gita']],
    // A null status counts as active.
    ['active', ['aina', 'ben', 'chandra', 'dewi', 'farah']],
    ['lead', ['aina']],
    ['contacted', ['ben']],
    ['qualified', ['chandra']],
    ['customer', ['dewi']],
    ['archived', ['ed', 'gita']],
  ])('view %s', (view, expected) => {
    expect(ids({ view })).toEqual(expected);
  });

  describe('search', () => {
    test('empty or blank search is no restriction', () => {
      expect(ids({ search: '' })).toHaveLength(CONTACTS.length);
      expect(ids({ search: '  \t ' })).toHaveLength(CONTACTS.length);
    });

    test('is trimmed and ignores case', () => {
      expect(ids({ search: '  AINA ' })).toEqual(['aina']);
    });

    test.each([
      ['first name', 'chandra', ['chandra']],
      ['last name', 'wijaya', ['chandra']],
      ['email', 'harbour.sg', ['ben']],
      ['company', 'bakery', ['farah']],
      ['phone', '5555', ['dewi']],
      ['tags', 'retail', ['chandra', 'gita']],
    ])('looks in %s', (_field, search, expected) => {
      expect(ids({ search })).toEqual(expected);
    });

    test('does not look in country, status or person in charge', () => {
      const only = [contact('x', { country: 'TH', status: 'Qualified', pic: 'Siti' })];
      for (const search of ['TH', 'qualified', 'siti']) {
        expect(filterContacts(only, {}, { ...ALL, search })).toEqual([]);
      }
      expect(filterContacts(only, {}, { ...ALL, search: 'x@example' })).toEqual(only);
    });

    test('every word must match, each in any field', () => {
      expect(ids({ search: 'ben harbour' })).toEqual(['ben']);
      expect(ids({ search: 'tan   BEN' })).toEqual(['ben']);
      expect(ids({ search: 'ben kedai' })).toEqual([]);
      // 'vip' is a tag on both, 'kopi' only in one company.
      expect(ids({ search: 'vip' })).toEqual(['aina', 'ben']);
      expect(ids({ search: 'vip kopi' })).toEqual(['aina']);
    });

    test('phone matches with punctuation removed from both sides', () => {
      expect(ids({ search: '012 345' })).toEqual(['aina']);
      expect(ids({ search: '60123456789' })).toEqual(['aina']);
      expect(ids({ search: '+60-12' })).toEqual(['aina']);
      expect(ids({ search: '(65)8123' })).toEqual(['ben']);
      expect(ids({ search: '0199990000' })).toEqual(['ed']);
    });

    test('phone still matches as typed', () => {
      expect(ids({ search: '+6012-345' })).toEqual(['aina']);
    });

    test('a word of only punctuation does not match every phone', () => {
      expect(ids({ search: '+' })).toEqual(['aina']);
      expect(ids({ search: '()' })).toEqual([]);
    });
  });

  test('scores keep contacts in any selected band', () => {
    expect(ids({ scores: ['hot'] })).toEqual(['aina', 'ed']);
    expect(ids({ scores: ['warm'] })).toEqual(['ben', 'chandra', 'gita']);
    expect(ids({ scores: ['cold'] })).toEqual(['dewi', 'farah']);
    expect(ids({ scores: ['hot', 'cold'] })).toEqual(['aina', 'dewi', 'ed', 'farah']);
  });

  test('pics keep contacts of any selected person; UNASSIGNED keeps those with nobody', () => {
    expect(ids({ pics: ['Siti'] })).toEqual(['aina', 'dewi']);
    expect(ids({ pics: ['Siti', 'Amir'] })).toEqual(['aina', 'ben', 'dewi', 'ed']);
    expect(ids({ pics: [UNASSIGNED] })).toEqual(['chandra', 'farah', 'gita']);
    expect(ids({ pics: ['Amir', UNASSIGNED] })).toEqual(['ben', 'chandra', 'ed', 'farah', 'gita']);
    expect(ids({ pics: ['Nobody'] })).toEqual([]);
  });

  test('countries keep contacts of any selected country', () => {
    expect(ids({ countries: ['SG'] })).toEqual(['ben']);
    expect(ids({ countries: ['SG', 'ID'] })).toEqual(['ben', 'chandra', 'gita']);
    expect(ids({ countries: ['—'] })).toEqual(['dewi']);
  });

  test('tags keep contacts with at least one selected tag, ignoring case', () => {
    expect(ids({ tags: ['vip'] })).toEqual(['aina', 'ben']);
    expect(ids({ tags: ['WHOLESALE'] })).toEqual(['aina', 'farah']);
    expect(ids({ tags: ['Bakery', 'retail'] })).toEqual(['chandra', 'farah', 'gita']);
    // 'ed' has no tags field and 'dewi' has an empty list: neither can match.
    expect(ids({ tags: ['nope'] })).toEqual([]);
  });

  test('followUp: any, open, overdue', () => {
    expect(ids({ followUp: 'any' })).toHaveLength(CONTACTS.length);
    expect(ids({ followUp: 'open' })).toEqual(['aina', 'ben']);
    expect(ids({ followUp: 'overdue' })).toEqual(['ben']);
  });

  test('followUp: an empty list or a missing entry is not an open follow-up', () => {
    expect(ids({ followUp: 'open' }, { aina: [] })).toEqual([]);
    expect(ids({ followUp: 'overdue' }, {})).toEqual([]);
    expect(ids({ followUp: 'any' }, {})).toHaveLength(CONTACTS.length);
  });

  test('all kinds must hold at once', () => {
    // view + score + person in charge
    expect(ids({ view: 'active', scores: ['hot', 'warm'], pics: ['Amir'] })).toEqual(['ben']);
    // country + tag + person in charge: Aina and Farah are both MY + wholesale.
    expect(ids({ countries: ['MY'], tags: ['wholesale'], pics: [UNASSIGNED] })).toEqual(['farah']);
    // search + score + follow-up
    expect(ids({ search: 'vip', scores: ['hot', 'warm'], followUp: 'overdue' })).toEqual(['ben']);
    // Each kind matches someone, but nobody matches all three.
    expect(ids({ view: 'archived', countries: ['MY'], scores: ['warm'] })).toEqual([]);
  });

  test('keeps input order', () => {
    const reversed = [...CONTACTS].reverse();
    const kept = filterContacts(reversed, FOLLOW_UPS, DEFAULT_FILTERS).map((c) => c.id);
    expect(kept).toEqual(['farah', 'dewi', 'chandra', 'ben', 'aina']);
  });

  test('does not mutate its inputs and returns a new array', () => {
    const contacts = structuredClone(CONTACTS);
    const followUps = structuredClone(FOLLOW_UPS);
    const filters: ContactFilters = {
      view: 'all',
      search: ' Vip ',
      scores: ['warm', 'hot'],
      pics: ['Siti', 'Amir'],
      countries: ['SG', 'MY'],
      tags: ['VIP'],
      followUp: 'open',
    };
    const filtersBefore = structuredClone(filters);

    const result = filterContacts(contacts, followUps, filters);

    expect(result.map((c) => c.id)).toEqual(['aina', 'ben']);
    expect(contacts).toEqual(CONTACTS);
    expect(followUps).toEqual(FOLLOW_UPS);
    expect(filters).toEqual(filtersBefore);

    const everything = filterContacts(contacts, followUps, ALL);
    expect(everything).toEqual(contacts);
    expect(everything).not.toBe(contacts);
    // Same contact objects, not copies.
    expect(everything[0]).toBe(contacts[0]);
  });

  test('an empty contact list gives an empty list', () => {
    expect(filterContacts([], FOLLOW_UPS, DEFAULT_FILTERS)).toEqual([]);
  });
});

describe('filterOptions', () => {
  test('lists people in charge, countries and tags found on the contacts', () => {
    expect(filterOptions(CONTACTS)).toEqual({
      pics: ['Amir', 'Siti', UNASSIGNED],
      countries: ['ID', 'MY', 'SG'],
      // 'VIP' and 'Wholesale' were seen before 'vip' and 'wholesale'.
      tags: ['Bakery', 'Retail', 'VIP', 'Wholesale'],
    });
  });

  test('leaves out UNASSIGNED when everyone has a person in charge', () => {
    const assigned = CONTACTS.filter((c) => c.pic);
    expect(filterOptions(assigned).pics).toEqual(['Amir', 'Siti']);
  });

  test('treats an empty name as nobody in charge', () => {
    const options = filterOptions([contact('x', { pic: '' }), contact('y', { pic: 'Zul' })]);
    expect(options.pics).toEqual(['Zul', UNASSIGNED]);
  });

  test('leaves out unknown and empty countries', () => {
    const options = filterOptions([
      contact('x', { country: '—' }),
      contact('y', { country: '' }),
      contact('z', { country: 'TH' }),
    ]);
    expect(options.countries).toEqual(['TH']);
  });

  test('keeps the first spelling of a tag and sorts ignoring case', () => {
    const options = filterOptions([
      contact('x', { tags: ['zebra', 'apple'] }),
      contact('y', { tags: ['Zebra', 'Mango', 'APPLE'] }),
      contact('z', {}),
    ]);
    expect(options.tags).toEqual(['apple', 'Mango', 'zebra']);
  });

  test('no contacts, no choices', () => {
    expect(filterOptions([])).toEqual({ pics: [], countries: [], tags: [] });
  });

  test('does not mutate the contacts', () => {
    const contacts = structuredClone(CONTACTS);
    filterOptions(contacts);
    expect(contacts).toEqual(CONTACTS);
  });
});

describe('activeFilterCount', () => {
  test('is 0 for the defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  test('counts search, scores, pics and countries once each', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: 'a' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, scores: ['hot', 'cold'] })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, pics: [UNASSIGNED] })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, countries: ['MY', 'SG'] })).toBe(1);
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        search: 'a',
        scores: ['hot'],
        pics: ['Siti'],
        countries: ['MY'],
      }),
    ).toBe(4);
  });

  test('a blank search does not count', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: '   ' })).toBe(0);
  });

  test('view, tags and followUp do not count', () => {
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, view: 'archived', tags: ['vip'], followUp: 'overdue' }),
    ).toBe(0);
  });
});
