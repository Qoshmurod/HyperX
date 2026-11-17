const modules = [
  ['Markaziy boshqaruv', 'Tashkilotlar, hududlar, xodimlar va rollar'],
  ['AI tahlilchi', 'Ma’lumotlar tahlili va manbali xulosalar'],
  ['Qaror tayyorlash', 'Variantlar, ta’sir va xavflar — yakuniy qaror inson tomonidan'],
  ['Faoliyat monitoringi', 'KPI, topshiriqlar va muddatlar nazorati'],
  ['Prognoz', 'Ehtiyoj va ish hajmini prognozlash'],
  ['Hisobotlar', 'Kunlik, haftalik, oylik va choraklik hisobotlar'],
  ['Audit', 'Barcha muhim harakatlar jurnali'],
  ['Integratsiya', 'REST API, webhook, import/eksport'],
];

export default function Home() {
  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ margin: 0, fontSize: 32 }}>GovMind AI</h1>
      <p style={{ color: 'var(--muted)', marginTop: 8 }}>
        Davlat boshqaruvi uchun tahlil va qarorlarni qo‘llab-quvvatlash platformasi
      </p>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 12,
          marginTop: 32,
        }}
      >
        {modules.map(([title, text]) => (
          <article
            key={title}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{title}</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
