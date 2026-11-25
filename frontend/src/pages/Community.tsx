import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandHeart, Lightbulb, MessagesSquare, ThumbsUp, Trophy } from "lucide-react";
import { useApp } from "../context";
import { api, useApi } from "../lib/api";
import type { Text3 } from "../lib/types";
import { ago, fmtNum } from "../lib/format";
import { DemoBadge, Loading, Tile } from "../components/Bits";
import ListenButton from "../components/ListenButton";
import { useHashScroll } from "./Society";

interface Tip { id: number; seasons: string[]; title: Text3; body: Text3 }
interface Thread { id: number; title: string; body: string; tag: string; lang: string; author: string; society: string | null;
  created_at: string; replies: number; votes: number; voted: boolean; is_demo: boolean;
  reply_list?: { id: number; body: string; author: string; created_at: string; is_demo: boolean }[] }
interface Board { societies: { id: number; name: string; households: number; litres: number; per_household: number | null }[];
  mine_litres: number; recent: { action: string; litres: number; day: string; is_demo: boolean }[] }
const TAGS = ["saving", "rwh", "borewell", "tanker", "general"];

function ThreadCard({ th, onChange }: { th: Thread; onChange: () => void }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const load = async () => setFull(await api<Thread>(`/api/forum/threads/${th.id}`));
  const toggle = async () => { if (!open && !full) await load(); setOpen(!open); };
  const vote = async () => { await api(`/api/forum/threads/${th.id}/vote`, { method: "POST" }); onChange(); };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setFull(await api<Thread>(`/api/forum/threads/${th.id}/replies`, { method: "POST", json: { body: reply } }));
    setReply(""); onChange();
  };
  return (
    <div className="rounded-2xl border border-line p-4" lang={th.lang}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-brand-sky text-brand">{t(`community.tag.${th.tag}`)}</span>
        <span className="text-ink-muted">{th.author}{th.society ? ` · ${th.society}` : ""} · {ago(th.created_at, lang)}</span>
        <DemoBadge show={th.is_demo} />
      </div>
      <button className="mt-1 text-left font-semibold hover:text-brand" onClick={() => void toggle()}>{th.title}</button>
      <p className="mt-1 text-sm text-ink-muted">{open && full ? full.body : th.body}</p>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => void vote()} className={`btn px-3 py-1 text-xs ${th.voted ? "bg-brand text-white" : "btn-ghost"}`}>
          <ThumbsUp size={12} /> {t("community.helpful", { count: th.votes })}</button>
        <button onClick={() => void toggle()} className="btn-ghost px-3 py-1 text-xs">{t("community.replies", { count: th.replies })}</button>
        <ListenButton text={`${th.title}. ${th.body}`} />
      </div>
      {open && full && (
        <div className="mt-3 space-y-2 border-l-2 border-brand-line pl-3">
          {full.reply_list?.map((r) => (
            <div key={r.id} className="text-sm"><b>{r.author}</b> <span className="text-xs text-ink-faint">{ago(r.created_at, lang)}</span><p className="text-ink-muted">{r.body}</p></div>
          ))}
          <form onSubmit={send} className="flex gap-2">
            <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("community.reply_placeholder")} />
            <button className="btn-primary" disabled={!reply.trim()}>{t("community.reply")}</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function Community() {
  const { t } = useTranslation();
  const { user, lang, setVisible } = useApp();
  useHashScroll();
  const tips = useApi<{ season: string; tips: Tip[] }>("/api/tips");
  const threads = useApi<Thread[]>("/api/forum/threads");
  const board = useApi<Board>("/api/savings/leaderboard");
  const actions = useApi<Record<string, number>>("/api/savings/actions");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("saving");
  const [saved, setSaved] = useState<string | null>(null);
  const canLog = user?.role !== "ward_officer";

  useEffect(() => {
    if (board.data) setVisible({ page: "community", leaderboard: board.data.societies, my_litres_30d: board.data.mine_litres,
      threads: threads.data?.slice(0, 4).map((x) => x.title) });
  }, [board.data, threads.data, setVisible]);

  const post = async (e: FormEvent) => {
    e.preventDefault();
    await api("/api/forum/threads", { method: "POST", json: { title, body, tag, lang } });
    setTitle(""); setBody(""); threads.reload();
  };
  const log = async (action: string) => {
    const r = await api<{ litres: number }>("/api/savings", { method: "POST", json: { action } });
    setSaved(t("community.logged", { litres: r.litres })); board.reload();
  };
  const max = Math.max(1, ...(board.data?.societies.map((s) => s.litres) ?? [1]));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t("nav.community")}</h1>
      <div className="grid gap-5 lg:grid-cols-12">
        <Tile className="lg:col-span-7" title={t("community.tips")} icon={Lightbulb} guide="tips"
              right={tips.data && <span className="chip bg-accent-soft text-accent-text">{t(`community.season.${tips.data.season}`)}</span>}>
          {!tips.data ? <Loading /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {tips.data.tips.slice(0, 6).map((tip) => (
                <div key={tip.id} className={`rounded-xl p-3 ${tip.seasons.includes(tips.data!.season) ? "bg-brand-sky" : "bg-plane"}`}>
                  <div className="font-semibold">{tip.title[lang]}</div>
                  <p className="mt-1 text-sm text-ink-muted">{tip.body[lang]}</p>
                  <ListenButton className="mt-2.5 bg-white" text={`${tip.title[lang]}. ${tip.body[lang]}`} />
                </div>
              ))}
            </div>
          )}
        </Tile>

        <div id="savings" className="scroll-mt-24 lg:col-span-5">
          <Tile title={t("community.savings")} icon={HandHeart} tone="accent" guide="savings-card" right={<DemoBadge show={board.data?.recent.some((r) => r.is_demo) ?? false} />}>
            {canLog && (
              <>
                <p className="mb-2 text-sm text-ink-muted">{t("community.savings_lead")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(actions.data ?? {}).map(([k, l]) => (
                    <button key={k} className="btn-ghost justify-between py-2 text-left text-xs" onClick={() => void log(k)}>
                      <span>{t(`community.action.${k}`)}</span><span className="shrink-0 whitespace-nowrap text-good">+{l} L</span>
                    </button>
                  ))}
                </div>
                {saved && <p className="mt-2 text-sm font-medium text-good" role="status">{saved}</p>}
                {board.data && <p className="mt-2 text-sm">{t("community.mine", { n: fmtNum(board.data.mine_litres, lang, 0) })}</p>}
              </>
            )}
            <div className="mt-4">
              <div className="eyebrow mb-2 flex items-center gap-1"><Trophy size={12} /> {t("community.leaderboard")}</div>
              <ul className="space-y-2">
                {board.data?.societies.map((s, i) => (
                  <li key={s.id} className="text-sm">
                    <div className="flex justify-between"><span className={user?.society_id === s.id ? "font-semibold text-brand" : ""}>{i + 1}. {s.name}</span>
                      <span className="tabnum">{fmtNum(s.litres, lang, 0)} L</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-accent" style={{ width: `${(100 * s.litres) / max}%` }} /></div>
                    <div className="text-[11px] text-ink-faint">{t("community.per_hh", { n: s.per_household ?? 0 })}</div>
                  </li>
                ))}
              </ul>
            </div>
          </Tile>
        </div>

        <Tile className="lg:col-span-12" title={t("community.forum")} icon={MessagesSquare} guide="forum">
          <form onSubmit={post} className="mb-4 grid gap-2 rounded-2xl bg-plane p-3 md:grid-cols-[1fr_10rem_auto]">
            <input className="input" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("community.thread_title")} />
            <select className="input" aria-label={t("community.topic")} value={tag} onChange={(e) => setTag(e.target.value)}>{TAGS.map((k) => <option key={k} value={k}>{t(`community.tag.${k}`)}</option>)}</select>
            <button className="btn-primary" disabled={title.length < 3 || body.length < 3}>{t("community.post")}</button>
            <textarea className="input md:col-span-3" required minLength={3} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("community.thread_body")} />
          </form>
          {!threads.data ? <Loading /> : (
            <div className="grid gap-3 md:grid-cols-2">{threads.data.map((th) => <ThreadCard key={th.id} th={th} onChange={threads.reload} />)}</div>
          )}
        </Tile>
      </div>
    </div>
  );
}
