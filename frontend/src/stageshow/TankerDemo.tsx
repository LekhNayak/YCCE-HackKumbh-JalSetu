import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check, CheckCheck, Droplet, Droplets, Pause, Play, Truck, X } from "lucide-react";
import { Stage } from "./kit/stage";
import type { Act } from "./kit/act";
import { Bar, Window } from "./kit/window";
import { Phone } from "./kit/phone";
import { Collapse } from "./kit/motion/Collapse";
import { States } from "./kit/motion/States";
import { Button } from "./kit/controls/Button";
import { useApp } from "../context";
import { fmtDate, fmtTime } from "../lib/format";
import type { Lang } from "../lib/langs";
import "./look.css";
import "./tanker.css";

// The start page's hero, after the gold "device-pair" (layout) and "hero-demo"
// (a cursor, a result). A resident logs today's water, marks the tanker as
// arrived, and the alert lands on a neighbour's phone in the neighbour's own
// language. An authored illustration: it never calls the API.
//
// Narrow, it is a second design: the tanker card and the phone only.
//
// Button labels are wrapped in a span on purpose: given a bare string the kit
// measures it to animate a change, and measures it before Poppins has loaded.

type S = { water: "ask" | "hours" | "logged"; today: boolean; tanker: "due" | "arrived"; alert: boolean };

const START: S = { water: "ask", today: false, tanker: "due", alert: false };
const END: S = { water: "logged", today: true, tanker: "arrived", alert: true };
const REST = { wide: { x: 384, y: 170 }, compact: { x: 268, y: 92 } };

// Six logged days, then today (not logged until the click)
const WEEK = ["none", "none", "came", "none", "came", "none"] as const;
const DAYS = ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"];
const DUE = new Date(2026, 10, 25, 15, 0).toISOString();
const ARRIVED = new Date(2026, 10, 25, 15, 2).toISOString();
const SOCIETY = "Sai Krupa Residency";

async function script(a: Act<S>) {
  await a.wait(900);

  if (a.layout === "wide") {
    a.mark("log");
    await a.click({ at: "came", x: 0.9, y: 0.7 });
    await a.set({ water: "hours" });
    await a.wait(450);
    await a.click({ at: "h2", x: 0.82, y: 0.72 });
    await a.set({ water: "logged" });
    await a.wait(180);
    await a.set({ today: true });
    await a.wait(800);
  }

  a.mark("tanker");
  await a.click({ at: "arrived", x: 0.9, y: 0.7 });
  await a.set({ tanker: "arrived" });
  await a.wait(420);
  a.mark("alert");
  await a.set({ alert: true });
  await a.wait(500);
  await a.move(a.layout === "compact" ? REST.compact : REST.wide);
  await a.wait(2400);

  // What the story added leaves last change first; the product stays put
  a.mark("seam");
  await a.set({ alert: false });
  await a.wait(80);
  await a.set({ tanker: "due" });
  await a.wait(80);
  await a.set({ today: false });
  await a.wait(80);
  await a.set({ water: "ask" });
  await a.wait(600);
}

function Brand({ size }: { size: number }) {
  return (
    <span className="tk-brand">
      <span className="tk-brand__mark" style={{ width: size, height: size, borderRadius: size / 3.4 }}><Droplets size={size * 0.56} aria-hidden /></span>
      <span className="tk-brand__word">Jal<b>Setu</b></span>
    </span>
  );
}

export default function TankerDemo() {
  const { t, i18n } = useTranslation();
  const { lang } = useApp();
  const [paused, setPaused] = useState(false);

  // The neighbour reads another language than the one this page is in
  const other: Lang = lang === "mr" ? "hi" : "mr";
  const tp = i18n.getFixedT(other);

  return (
    <figure>
      <div role="img" aria-label={t("start.demo_label")}>
        <Stage width={784} height={464} compact={{ below: 730, width: 350, height: 536 }} fill initial={START} poster={END}
               script={paused ? undefined : script} cursor={{ at: REST }} greys="cool" className="js-look tk">
          {(s, _rect, layout) => (
            <>
              <Window title="JalSetu" className="tk-window">
                <div className="tk-top">
                  <Brand size={26} />
                  <span className="tk-nav" data-on>{t("nav.home")}</span>
                  {layout === "wide" && [62, 78, 44].map((w) => <span key={w} className="tk-nav"><Bar w={w} h={7} tone={4} /></span>)}
                </div>

                <div className="tk-page">
                  {layout === "wide" && (
                    <section className="tk-card">
                      <header className="tk-head">
                        <span className="tk-chip"><Droplet size={15} aria-hidden /></span>
                        <span className="tk-title">{t("home.water_today")}</span>
                      </header>
                      <States
                        value={s.water}
                        align="start"
                        className="tk-answer"
                        states={{
                          ask: (
                            <>
                              <Button variant="primary" className="tk-btn" data-target="came" data-cursor={s.water === "ask" ? "hand" : "pointer"} icon={<Droplet size={15} aria-hidden />}><span>{t("home.came")}</span></Button>
                              <Button className="tk-btn" icon={<X size={15} aria-hidden />}><span>{t("home.none")}</span></Button>
                            </>
                          ),
                          hours: (
                            <>
                              {[1, 2, 3, 4].map((h) => (
                                <Button key={h} variant="tertiary" className="tk-btn tk-btn--hour" data-target={`h${h}`} data-cursor={s.water === "hours" ? "hand" : "pointer"}>
                                  <span>{h === 4 ? t("home.hours_more") : t("home.hours_n", { n: h })}</span>
                                </Button>
                              ))}
                            </>
                          ),
                          logged: (
                            <span className="tk-logged"><Check size={15} strokeWidth={2.6} aria-hidden />{t("home.logged_came", { hours: t("home.hours_n", { n: 2 }) })}</span>
                          ),
                        }}
                      />
                      <div className="tk-week">
                        {DAYS.map((d, i) => (
                          <span key={d} className="tk-day">
                            <i data-state={i < 6 ? WEEK[i] : s.today ? "came" : "unknown"} />
                            <span>{fmtDate(d, lang, { weekday: "short" })}</span>
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="tk-card">
                    <header className="tk-head">
                      <span className="tk-chip" data-tone="accent"><Truck size={15} aria-hidden /></span>
                      <span className="tk-title">{t("home.next_tanker")}</span>
                      <span className="tk-time">{fmtTime(DUE, lang)}</span>
                    </header>
                    <Button variant="primary" className="tk-btn tk-btn--tanker" data-target="arrived" data-cursor="hand" data-done={s.tanker === "arrived" || undefined}>
                      <States
                        value={s.tanker}
                        states={{
                          due: <span className="tk-label"><Truck size={16} aria-hidden />{t("home.tanker_arrived")}</span>,
                          arrived: <span className="tk-label"><Check size={16} strokeWidth={2.6} aria-hidden />{t("home.tanker_marked", { time: fmtTime(ARRIVED, lang) })}</span>,
                        }}
                      />
                    </Button>
                  </section>

                  {/* Filler the crop takes; narrow, the phone stands here */}
                  {layout === "wide" && (
                    <section className="tk-card">
                      <header className="tk-head"><Bar w={30} h={30} r={9} tone={2} /><Bar w={112} h={9} tone={4} /></header>
                      {[260, 214, 238].map((w) => <Bar key={w} w={w} h={8} tone={2} style={{ marginTop: 14 }} />)}
                    </section>
                  )}
                </div>
              </Window>

              <Phone width={layout === "compact" ? 306 : 284} time="3:02" wallpaper="#f6f8fe" className="tk-phone">
                <div className="tk-app" lang={other}>
                  <div className="tk-app__bar"><Brand size={34} /></div>
                  <section className="tk-app__card">
                    <header className="tk-app__head">
                      <span className="tk-app__chip"><Bell size={21} aria-hidden /></span>
                      <span>{tp("home.alerts_title")}</span>
                    </header>
                    <Collapse open={s.alert} reveal="drop">
                      <div className="tk-alert" data-new>
                        <span className="tk-alert__kind"><i />{tp("alert.tanker_arrived")}</span>
                        <p className="tk-alert__text">{tp("start.demo_alert", { society: SOCIETY, time: "15:02" })}</p>
                        <span className="tk-alert__time">{fmtTime(ARRIVED, other)}<CheckCheck size={16} aria-hidden /></span>
                      </div>
                    </Collapse>
                    {[[96, 296, 208], [78, 276, 164], [104, 290, 190]].map(([kind, a, b]) => (
                      <div key={kind} className="tk-alert">
                        <Bar w={kind} h={26} r={13} tone={1} />
                        <Bar w={a} h={11} tone={2} style={{ marginTop: 15 }} />
                        <Bar w={b} h={11} tone={2} style={{ marginTop: 13 }} />
                      </div>
                    ))}
                  </section>
                </div>
              </Phone>
            </>
          )}
        </Stage>
      </div>
      <figcaption className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span>{t("start.demo_caption")}</span>
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={t(paused ? "start.demo_play" : "start.demo_pause")} title={t(paused ? "start.demo_play" : "start.demo_pause")}
                className="btn-ghost shrink-0 rounded-lg p-2 motion-reduce:hidden">
          {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
        </button>
      </figcaption>
    </figure>
  );
}
