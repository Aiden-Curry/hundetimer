export type Trainer = {
  id: string;
  slug: string;
  name: string;
  city: string;
  distanceKm: number;
  rating: number;
  reviews: number;
  specialties: string[];
  bio: string;
  verified: boolean;
  services: Service[];
};

export type Service = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  priceNok: number;
  bookingMode: 'request' | 'instant';
  slots: string[];
};

export const trainers: Trainer[] = [
  {
    id: 'trainer-1',
    slug: 'carina-josefine',
    name: 'Carina Josefine',
    city: 'Ringsaker',
    distanceKm: 8,
    rating: 4.9,
    reviews: 61,
    specialties: ['Hverdagslydighet', 'Trygghet og mestring', 'Triks', 'Styrketrening'],
    bio: 'Belønningsbasert hundetrening med praktisk hjelp til hverdagen, trygghet og morsom trening sammen.',
    verified: true,
    services: [
      {
        id: 'service-1',
        title: 'Privattime',
        description: 'Individuell trening tilpasset deg og hunden din.',
        durationMinutes: 60,
        priceNok: 850,
        bookingMode: 'request',
        slots: ['2026-09-29T10:00:00+02:00', '2026-09-29T13:30:00+02:00', '2026-09-30T17:00:00+02:00', '2026-10-01T11:00:00+02:00'],
      },
      {
        id: 'service-2',
        title: 'Nettkonsultasjon',
        description: 'Videokonsultasjon for treningsplaner, atferdsspørsmål og oppfølging.',
        durationMinutes: 45,
        priceNok: 650,
        bookingMode: 'instant',
        slots: ['2026-09-29T18:00:00+02:00', '2026-10-01T15:00:00+02:00'],
      },
    ],
  },
  {
    id: 'trainer-2',
    slug: 'mjosa-hundetrening',
    name: 'Mjøsa Hundetrening',
    city: 'Hamar',
    distanceKm: 19,
    rating: 4.8,
    reviews: 34,
    specialties: ['Valp', 'Innkalling', 'Gå pent i bånd', 'Nosework'],
    bio: 'Hyggelig lokal hundetrening for valper og familiehunder, med privattimer og små gruppekurs.',
    verified: true,
    services: [
      {
        id: 'service-3',
        title: 'Privattime for valp',
        description: 'En individuell valpetime med fokus på det dere trenger mest hjelp med akkurat nå.',
        durationMinutes: 60,
        priceNok: 790,
        bookingMode: 'request',
        slots: ['2026-09-30T09:00:00+02:00', '2026-10-02T12:00:00+02:00'],
      },
    ],
  },
  {
    id: 'trainer-3',
    slug: 'gjoevik-hundehjelp',
    name: 'Gjøvik Hundehjelp',
    city: 'Gjøvik',
    distanceKm: 31,
    rating: 4.7,
    reviews: 22,
    specialties: ['Passeringsutfordringer', 'Frykt', 'Atferd', 'Hjemmetrening'],
    bio: 'Praktisk atferdshjelp for hunder som synes deler av hverdagen er vanskelig.',
    verified: false,
    services: [
      {
        id: 'service-4',
        title: 'Atferdskonsultasjon',
        description: 'Førstegangskonsultasjon med kartlegging og en praktisk treningsplan.',
        durationMinutes: 90,
        priceNok: 1250,
        bookingMode: 'request',
        slots: ['2026-10-01T10:00:00+02:00', '2026-10-03T14:00:00+02:00'],
      },
    ],
  },
];

export const pendingBookings = [
  {
    id: 'booking-1',
    customer: 'Emma',
    dog: 'Luna',
    service: 'Privattime',
    startsAt: '2026-09-29T13:30:00+02:00',
    priceNok: 850,
    status: 'pending',
  },
  {
    id: 'booking-2',
    customer: 'Jonas',
    dog: 'Balder',
    service: 'Nettkonsultasjon',
    startsAt: '2026-10-01T15:00:00+02:00',
    priceNok: 650,
    status: 'confirmed',
  },
];

export function findTrainer(slug: string) {
  return trainers.find((trainer) => trainer.slug === slug);
}

export function findService(id: string) {
  for (const trainer of trainers) {
    const service = trainer.services.find((item) => item.id === id);
    if (service) return { trainer, service };
  }
  return undefined;
}
