import type { TicketResult } from "@/lib/types";

interface ResultCardProps {
  ticket: TicketResult;
  index?: number;
}

function isUnknown(value: string | undefined): boolean {
  return !value || value.toLowerCase() === "unknown";
}

function DetailCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (isUnknown(value)) return null;
  return (
    <div>
      <p className="mb-0.5 text-xs uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

export function ResultCard({ ticket, index = 0 }: ResultCardProps) {
  const animationDelay = `${index * 80}ms`;

  return (
    <article
      className="group rounded-xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-slate-900/70"
      style={{ animationDelay, opacity: 1 }}
    >
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Platform badge */}
          <span className="mb-2 inline-block rounded bg-[#3D7FFC]/10 px-2 py-0.5 text-xs font-medium text-[#3D7FFC]">
            {ticket.platform}
          </span>

          {/* Event name */}
          {!isUnknown(ticket.eventName) && (
            <h3 className="truncate text-base font-semibold text-white">
              {ticket.eventName}
            </h3>
          )}

          {/* Venue + city */}
          {(!isUnknown(ticket.venue) || !isUnknown(ticket.city)) && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-white/60">
              <svg
                className="h-3.5 w-3.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {[ticket.venue, ticket.city].filter(v => !isUnknown(v)).join(" · ")}
            </p>
          )}
        </div>

        {/* Price — prominent */}
        <div className="flex-shrink-0 text-right">
          {!isUnknown(ticket.price) && (
            <p className="text-xl font-bold text-white">
              {ticket.currency && ticket.currency !== ticket.price.slice(0, 1)
                ? `${ticket.currency} `
                : ""}
              {ticket.price}
            </p>
          )}
          {ticket.ticketType && ticket.ticketType !== "Unknown" && (
            <p className="text-xs text-white/50">{ticket.ticketType}</p>
          )}
        </div>
      </div>

      {/* Detail grid */}
      <div className="mb-4 grid grid-cols-3 gap-4 border-t border-white/5 pt-4">
        <DetailCell label="Section" value={ticket.section} />
        <DetailCell label="Row" value={ticket.row} />
        <DetailCell label="Seats" value={ticket.seats} />
        <DetailCell label="Qty" value={ticket.quantity} />
        <DetailCell label="Date" value={ticket.eventDate} />
      </div>

      {/* Notes */}
      {ticket.notes && (
        <p className="mb-4 text-xs text-white/50">{ticket.notes}</p>
      )}

      {/* CTA */}
      <div className="flex items-center gap-2">
        <a
          href={ticket.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#9D97F4] via-[#3D7FFC] to-[#15C1E6] px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-[#3D7FFC]/30"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
          </svg>
          View listing
        </a>
      </div>
    </article>
  );
}