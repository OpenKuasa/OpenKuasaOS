/**
 * Who each product is named after in the legends of the Melaka court (as told
 * in the Hikayat Hang Tuah), and why that name suits the product.
 * Keyed by product key.
 */
export const LEGEND: Record<string, { name: string; who: string; why: string }> = {
  command: {
    name: 'Hang Tuah',
    who: 'Hang Tuah was the Laksamana, the admiral who commanded Melaka’s fleet.',
    why: 'This is where you command the business.',
  },
  reach: {
    name: 'Hang Jebat',
    who: 'Hang Jebat is the companion remembered for refusing to stay silent.',
    why: 'This is how your business gets heard.',
  },
  crm: {
    name: 'Hang Kasturi',
    who: 'Hang Kasturi was one of the five sworn companions, bound by loyalty.',
    why: 'This is where you keep your customers close.',
  },
  people: {
    name: 'Hang Lekiu',
    who: 'Hang Lekiu was one of the five sworn companions, a band that held together.',
    why: 'This is where your team is run.',
  },
  hire: {
    name: 'Hang Lekir',
    who: 'Hang Lekir was one of the five sworn companions.',
    why: 'Every band begins by finding its people; this is where you hire.',
  },
  finance: {
    name: 'The Bendahara',
    who: 'The Bendahara was the chief minister who ran the court of Melaka.',
    why: 'This is where the books are run.',
  },
};
