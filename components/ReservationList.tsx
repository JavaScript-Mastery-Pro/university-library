import NotFound from "./NotFound";
import ReservationCard from "./ReservationCard";

interface Props {
  title: string;
  reservations: ReservedBook[];
  containerClassName?: string;
}

const ReservationList = ({
  title,
  reservations,
  containerClassName,
}: Props) => {
  return (
    <section className={containerClassName}>
      <h2 className="font-bebas-neue text-4xl text-light-100">{title}</h2>

      {reservations.length > 0 ? (
        <ul className="book-list">
          {reservations.map((item) => (
            <ReservationCard key={item.reservation.id} {...item} />
          ))}
        </ul>
      ) : (
        <NotFound
          title="No reservations yet"
          description="When a book is fully borrowed out, reserve it to join the waitlist — it'll show up here."
        />
      )}
    </section>
  );
};

export default ReservationList;
