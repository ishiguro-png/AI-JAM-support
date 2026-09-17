import Link from "next/link";

const links = [
  { href: "/", label: "ダッシュボード" },
  { href: "/contracts", label: "契約一覧" },
  { href: "/contracts/import", label: "CSVインポート" },
  { href: "/templates", label: "メールテンプレート" },
  { href: "/staff", label: "担当者管理" },
];

export function NavBar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          AI JAM サポート管理
        </Link>
        <nav className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-slate-600 hover:text-brand-600"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
