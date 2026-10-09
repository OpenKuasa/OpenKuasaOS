/**
 * Who each product is named after, in the legends of the Melaka court
 * (as told in the Hikayat Hang Tuah). Keyed by product key.
 */
export const LEGEND: Record<string, { name: string; note: string }> = {
  command: {
    name: 'Hang Tuah',
    note: 'Named after Hang Tuah, the Laksamana of Melaka.',
  },
  reach: {
    name: 'Hang Jebat',
    note: 'Named after Hang Jebat, Tuah’s closest companion.',
  },
  crm: {
    name: 'Hang Kasturi',
    note: 'Named after Hang Kasturi, one of the five companions.',
  },
  people: {
    name: 'Hang Lekiu',
    note: 'Named after Hang Lekiu, one of the five companions.',
  },
  hire: {
    name: 'Hang Lekir',
    note: 'Named after Hang Lekir, one of the five companions.',
  },
  finance: {
    name: 'The Bendahara',
    note: 'Named after the Bendahara, the chief minister who ran the court.',
  },
};
