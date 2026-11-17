'use client';

/** Kutilmagan xato (masalan, API vaqtincha ishlamayapti) uchun sahifa — 4 tilda. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold">Xatolik yuz berdi · Хатолик юз берди · Произошла ошибка · Something went wrong</h1>
      <p className="text-sm text-muted">
        Server vaqtincha javob bermayapti. Bir ozdan keyin qayta urinib ko'ring.
        <br />
        Сервер временно не отвечает. Повторите попытку позже.
        <br />
        The server is temporarily unavailable. Please try again shortly.
      </p>
      <div className="flex gap-2">
        <button onClick={reset} className="rounded-md bg-accent px-3 py-2 text-sm text-accent-fg">
          ↻
        </button>
        <a href="/login" className="rounded-md border border-border px-3 py-2 text-sm">
          Login
        </a>
      </div>
    </main>
  );
}
