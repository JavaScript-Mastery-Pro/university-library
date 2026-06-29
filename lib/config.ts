const config = {
  env: {
    imagekit: {
      publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
    },
    apiEndpoint: process.env.NEXT_PUBLIC_API_ENDPOINT,
    prodApiEndpoint: process.env.NEXT_PUBLIC_PROD_API_ENDPOINT,
    databaseUrl: process.env.DATABASE_URL,
    upstash: {
      redisUrl: process.env.UPSTASH_REDIS_URL,
      redisToken: process.env.UPSTASH_REDIS_TOKEN,
      qstashUrl: process.env.QSTASH_URL,
      qstashToken: process.env.QSTASH_TOKEN,
    },
    resendToken: process.env.RESEND_TOKEN,
  },
  // Late-fine domain constants (ADR 0001). These are NOT secrets — never read
  // them via process.env. `computeFine` (lib/fines.ts) and the live-accrual
  // display are the only consumers.
  fines: {
    ratePerDay: 1.0, // USD charged per chargeable overdue day
    graceDays: 1, // first overdue day is free
    maxFine: 20.0, // USD cap on a single fine
    currency: "USD",
  },
  // Reservation / waitlist domain constants (ADR 0002). NOT secrets — never read
  // via process.env. Consumed by the reservation display helpers (lib/reservations.ts)
  // and, later, by reserveBook + the hold-expiry workflow.
  reservations: {
    holdWindowHours: 48, // how long a READY copy is held for the front of the queue
    maxActiveReservations: 5, // cap on QUEUED + READY reservations per user
    reminderBeforeHours: 24, // send the expiry-soon email at this much time remaining
  },
};

export default config;
