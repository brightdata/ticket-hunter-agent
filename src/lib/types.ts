export interface SerpResult {
  url: string;
  title: string;
  platform: string;
}

export interface TicketResult {
  eventName: string;
  eventDate: string;
  venue: string;
  city: string;
  ticketType: string;
  section: string;
  row: string;
  seats: string;
  quantity: string;
  price: string;
  currency: string;
  platform: string;
  url: string;
  notes: string;
}

export interface SearchStatusEntry {
  timestamp: string;
  message: string;
}
