"use client";


interface SearchFormProps {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function SearchForm({
  onSubmit,
  isLoading = false,
  isDisabled = false,
}: SearchFormProps) {
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (isLoading || isDisabled) return;

    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("query") ?? "").trim();
    if (!query) return;

    onSubmit(query);
  };

  const inactive = isLoading || isDisabled;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form onSubmit={handleSubmit}>
        <div
          className={`flex items-center rounded-xl border bg-slate-900/60 px-4 py-3 backdrop-blur-sm transition-all duration-200 ${
            inactive
              ? "cursor-not-allowed border-white/5 opacity-60"
              : "border-white/10 focus-within:border-[#3D7FFC]/50 focus-within:ring-2 focus-within:ring-[#3D7FFC]/20"
          }`}
        >
          {/* Search icon */}
          <svg
            className="mr-3 h-5 w-5 flex-shrink-0 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            name="query"
            type="text"
            placeholder="Taylor Swift Eras Tour NYC, Champions League Final..."
            disabled={inactive}
            maxLength={300}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/40 disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={inactive}
            className={`ml-3 flex flex-shrink-0 items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-all duration-200 ${
              inactive
                ? "cursor-not-allowed bg-[#3D7FFC]/40"
                : "bg-gradient-to-r from-[#9D97F4] via-[#3D7FFC] to-[#15C1E6] hover:scale-[1.02] hover:shadow-lg hover:shadow-[#3D7FFC]/30 active:scale-[0.98]"
            }`}
          >
            {isLoading ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Searching...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Hunt Tickets
              </>
            )}
          </button>
        </div>
      </form>

      {/* Search tips / rate limit message */}
      <div className="mt-4 space-y-1 text-center text-sm text-white/40">
        <p>
          <span className="text-white/60">Try:</span> &quot;Coldplay Music of
          the Spheres London&quot; · &quot;NBA Finals Game 7&quot; · &quot;Hamilton
          Broadway NYC&quot;
        </p>
        {isDisabled && !isLoading && (
          <p className="mt-2 text-amber-400/80">
            You&apos;ve already searched today. Try again in 24h.
          </p>
        )}
      </div>
    </div>
  );
}