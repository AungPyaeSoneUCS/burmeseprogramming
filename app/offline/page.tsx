import Link from "next/link";

export const metadata = {
  title: "အော့ဖ်လိုင်း — Offline",
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-4 pb-16 pt-10 text-center lg:px-8">
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00ffff]/15 text-3xl"
        aria-hidden="true"
      >
        📡
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        သင်နောက်တစ်ခါ အင်တာနက်ချိတ်ထားစဉ် လာရောက်ဖူးသည့် သင်ခန်းစာများကို ဤအက်ပ်မှ အော့ဖ်လိုင်း ဖတ်နိုင်ပါသည်
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        ယခုအချိန်တွင် အင်တာနက်မရှိပါ။ ဤစာမျက်နှာကို ဒေါင်းလုဒ်မလုပ်ရသေးပါ။ အင်တာနက်ပြန်ရသည့်အခါ
        သင်ခန်းစာများကို ဖွင့်ကြည့်ပါ၊ ထို့နောက် အော့ဖ်လိုင်းဖတ်ရန် အလိုအလျောက် သိမ်းဆည်းပေးပါမည်။
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-[#00ffff] px-5 py-2.5 text-sm font-semibold text-cyan-950 no-underline transition hover:bg-[#00d9dc]"
        >
          မူလစာမျက်နှာသို့ ပြန်သွားရန်
        </Link>
      </div>
    </div>
  );
}