import dayjs from "dayjs";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Avatar from "@/components/Avatar";
import BookCover from "@/components/BookCover";
import Pagination from "@/components/Pagination";
import BookReceipt from "@/components/BookReceipt";

import Menu from "@/components/admin/Menu";
import FineStatus from "@/components/FineStatus";
import { borrowStatuses } from "@/constants";
import { getBorrowRecords } from "@/lib/admin/actions/book";
import { getFineDisplay } from "@/lib/fines";

const Page = async ({ searchParams }: PageProps) => {
  const { query, sort, page } = await searchParams;

  const { data: allRecords, metadata } = await getBorrowRecords({
    query,
    sort,
    page,
  });

  return (
    <section className="w-full rounded-2xl bg-white p-7">
      <h2 className="text-xl font-semibold">Borrow Book Requests</h2>

      <div className="mt-7 w-full overflow-hidden">
        <Table className="overflow-hidden">
          <TableHeader>
            <TableRow className="h-14 border-none bg-light-300">
              <TableHead className="w-72">Book Title</TableHead>
              <TableHead>User Requested</TableHead>
              <TableHead>Borrowed Date</TableHead>
              <TableHead>Return Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fine</TableHead>
              <TableHead>Receipt</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {allRecords!?.length > 0 ? (
              allRecords!.map((record) => (
                <TableRow
                  key={record.borrow.id}
                  className="border-b-dark-100/5"
                >
                  <TableCell className="py-5 font-medium">
                    <div className="flex w-72 flex-row items-center gap-2 text-sm font-semibold text-dark-400">
                      <BookCover
                        variant="extraSmall"
                        coverUrl={record.coverUrl}
                        coverColor={record.coverColor}
                      />
                      <p className="flex-1">{record.title}</p>
                    </div>
                  </TableCell>

                  <TableCell className="text-sm">
                    <div className="flex flex-row items-center gap-2">
                      <Avatar name={record.user.fullname} size="md" />
                      <div>
                        <p className="font-semibold text-dark-400">
                          {record.user.fullname}
                        </p>
                        <p className="text-dark-100">{record.user.email}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-sm font-medium text-dark-200">
                    {dayjs(record.borrow.borrowDate).format("MMM DD, YYYY")}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-dark-200">
                    {record.borrow.returnDate
                      ? dayjs(record.borrow.returnDate).format("MMM DD, YYYY")
                      : "---"}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-dark-200">
                    {dayjs(record.borrow.dueDate).format("MMM DD, YYYY")}
                  </TableCell>
                  <TableCell>
                    <Menu
                      label="Change Status"
                      initialValue={record.borrow.status!.toLowerCase()}
                      items={borrowStatuses}
                    />
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const fine = getFineDisplay(record.borrow);
                      return (
                        <FineStatus
                          status={fine.status}
                          amount={fine.amount}
                          showNone
                        />
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <BookReceipt
                      btnVariant="admin"
                      {...(record as BorrowedBook)}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center pt-10">
                  No records found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8">
        <Pagination variant="light" hasNextPage={metadata?.hasNextPage} />
      </div>
    </section>
  );
};

export default Page;
