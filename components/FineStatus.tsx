import { cn } from "@/lib/utils";
import { formatFine } from "@/lib/placeholder/fines";

interface Props {
  status: FineStatus;
  amount: number;
  /** Render a muted dash for the NONE state (table cells); profile renders nothing. */
  showNone?: boolean;
  className?: string;
}

const STYLE: Record<
  Exclude<FineStatus, "NONE">,
  { bg: string; text: string }
> = {
  UNPAID: { bg: "bg-[#FFF1F3]", text: "text-[#C01048]" },
  PAID: { bg: "bg-[#ECFDF3]", text: "text-[#027A48]" },
  WAIVED: { bg: "bg-[#F2F4F7]", text: "text-[#475467]" },
};

const FineStatus = ({ status, amount, showNone = false, className }: Props) => {
  if (status === "NONE") {
    return showNone ? (
      <span className={cn("text-sm text-dark-200", className)}>—</span>
    ) : null;
  }

  const { bg, text } = STYLE[status];

  // Visible label is concise; a screen-reader-only label spells out the amount.
  const visibleLabel =
    status === "UNPAID"
      ? `Owed ${formatFine(amount)}`
      : status === "PAID"
        ? "Paid"
        : "Waived";

  const srLabel =
    status === "UNPAID"
      ? `Late fine owed: ${formatFine(amount)}`
      : status === "PAID"
        ? `Late fine of ${formatFine(amount)} paid`
        : `Late fine of ${formatFine(amount)} waived`;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-medium",
        bg,
        text,
        className
      )}
    >
      <span aria-hidden="true">{visibleLabel}</span>
      <span className="sr-only">{srLabel}</span>
    </span>
  );
};

export default FineStatus;
