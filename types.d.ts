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

interface BorrowRecord {
  id: string;
  userId: string;
  bookId: string;
  borrowDate: Date;
  dueDate: string;
  returnDate: string | null;
  status: string;
}

interface BorrowedBook extends Book {
  borrow: BorrowRecord;
  user?: User;
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
