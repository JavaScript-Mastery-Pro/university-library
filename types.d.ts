interface AuthCredentails {
  fullname: string;
  email: string;
  password: string;
  universityId: number;
  universityCard: string;
}

interface User {
  id: string;
  fullname: string;
  email: string;
  universityId: number;
  universityCard: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | null;
  role: "USER" | "ADMIN" | null;
  lastActivityDate: string | null;
  createdAt: Date | null;
}

interface Book {
  id: string;
  title: string;
  author: string;
  genre: string;
  rating: number;
  totalCopies: number;
  availableCopies: number;
  coverColor: string;
  description?: string;
  coverUrl: string;
  videoUrl: string;
  summary: string;
  createdAt: Date | null;
}

type FineStatus = "NONE" | "UNPAID" | "PAID" | "WAIVED";

interface BorrowRecord {
  id: string;
  userId: string;
  bookId: string;
  borrowDate: Date;
  dueDate: string;
  returnDate: string | null;
  status: string;
  // Late-fine fields (ADR 0001), now backed by real columns on borrow_records.
  // `fineAmount` (numeric) and `fineSettledAt` (timestamptz) are null until a fine is
  // frozen at return / settled by an admin; `fineStatus` is NOT NULL, default "NONE".
  fineAmount: string | null;
  fineStatus: FineStatus;
  fineSettledAt: Date | null;
}

interface BorrowedBook extends Book {
  borrow: BorrowRecord;
  user?: User;
}

// Reservations / waitlist (ADR 0002). A reservation holds a place in a
// first-come-first-served queue for a fully-borrowed book; the front-of-queue
// entry flips to READY (a copy held for 48h) when a copy is returned.
type ReservationStatus =
  | "QUEUED"
  | "READY"
  | "FULFILLED"
  | "EXPIRED"
  | "CANCELLED";

interface Reservation {
  id: string;
  userId: string;
  bookId: string;
  status: ReservationStatus;
  createdAt: Date;
  // Set only when the reservation transitions to READY (now + holdWindowHours).
  expiresAt: Date | null;
}

// A reservation joined with its book and derived queue position, for display.
// `queuePosition` is the 1-based rank among QUEUED entries, null when not QUEUED.
interface ReservedBook extends Book {
  reservation: Reservation;
  queuePosition: number | null;
}

interface ReserveBookParams {
  bookId: string;
}

interface CancelReservationParams {
  reservationId: string;
}

interface BookParams {
  title: string;
  author: string;
  genre: string;
  rating: number;
  coverUrl: string;
  coverColor: string;
  description: string;
  totalCopies: number;
  videoUrl: string;
  summary: string;
}

interface BorrowBookParams {
  bookId: string;
  userId: string;
}

interface ReturnBookParams {
  recordId: string;
}

interface PageProps {
  searchParams: Promise<{
    query?: string;
    sort?: string;
    page?: number;
  }>;
  params: Promise<{ id: string }>;
}

interface QueryParams {
  query?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

interface Metdata {
  totalPages?: number;
  hasNextPage?: boolean;
}

interface UpdateAccountStatusParams {
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface UpdateBookParams extends BookParams {
  bookId: string;
}

interface FineActionParams {
  recordId: string;
}
