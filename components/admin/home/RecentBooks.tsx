import Link from "next/link";
import Image from "next/image";

import BookStripe from "../BookStripe";
import { Button } from "@/components/ui/button";

import { getBooks } from "@/lib/admin/actions/book";

const RecentBooks = async () => {
  const { data: recentBooks } = await getBooks({
    sort: "newest",
    page: 1,
    limit: 7,
  });

  if (!recentBooks) {
    throw new Error("Failed to fetch recent books");
  }

  return (
    <section className="flex-1 bg-white p-4 rounded-xl">
      <div className="flex justify-between">
        <h3 className="font-semibold text-dark-400  text-xl">
          Recently Added Books
        </h3>

        <Button
          asChild
          className="bg-light-300 rounded-md text-primary-admin font-semibold hover:bg-light-300/80 shadow-none"
        >
          <Link href="/admin/books">View All</Link>
        </Button>
      </div>

      <Link
        href="/admin/books/new"
        className="mt-7 mb-3 bg-light-300 py-4 px-3 flex flex-row items-center rounded-xl gap-4"
      >
        <div className="size-12 bg-white rounded-full flex justify-center items-center">
          <Image
            src="/icons/admin/plus.svg"
            width={18}
            height={18}
            alt="plus"
            className="object-contain"
          />
        </div>
        <p className="font-semibold text-lg text-dark-400">Add New Book</p>
      </Link>

      <div className="space-y-3">
        {recentBooks?.length! > 0 &&
          recentBooks?.map((book) => (
            <BookStripe key={book.id} book={book as Book} />
          ))}
      </div>
    </section>
  );
};

export default RecentBooks;
