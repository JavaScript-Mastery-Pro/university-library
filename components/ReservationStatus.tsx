import { cn } from "@/lib/utils";
import { getReservationDisplay } from "@/lib/reservations";

interface Props {
  reservation: Reservation;
  className?: string;
}

// Colour pairing per tone, mirroring FineStatus's light-chip approach so the
// badges read consistently across the (dark) profile and book pages.
const TONE_STYLE: Record<string, { bg: string; text: string }> = {
  ready: { bg: "bg-[#ECFDF3]", text: "text-[#027A48]" },
  queued: { bg: "bg-[#EFF8FF]", text: "text-[#175CD3]" },
  expired: { bg: "bg-[#FFF1F3]", text: "text-[#C01048]" },
  fulfilled: { bg: "bg-[#F2F4F7]", text: "text-[#475467]" },
  cancelled: { bg: "bg-[#F2F4F7]", text: "text-[#475467]" },
};

const ReservationStatus = ({ reservation, className }: Props) => {
  const { label, srLabel, tone } = getReservationDisplay(reservation);
  const { bg, text } = TONE_STYLE[tone];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-medium",
        bg,
        text,
        className
      )}
    >
      {/* Colour is never the sole signal — the visible text carries the state. */}
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{srLabel}</span>
    </span>
  );
};

export default ReservationStatus;
