import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/f/$slug")({
  component: PublicForm,
});

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-intake`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type FormCfg = {
  name: string;
  welcome_message: string;
  active: boolean;
  attendant_name?: string | null;
  attendant_avatar_url?: string | null;
  attendant_online?: boolean | null;
  privacy_policy_url?: string | null;
};
type Msg = { from: "bot" | "user"; text: string };
type Step =
  | "loading"
  | "intro"
  | "name"
  | "age"
  | "date"
  | "contact"
  | "submitting"
  | "done"
  | "error"
  | "unavailable";

function useTypingMessages() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);

  async function pushBot(text: string) {
    setTyping(true);
    await new Promise((r) => setTimeout(r, 600));
    setTyping(false);
    setMessages((m) => [...m, { from: "bot", text }]);
  }
  function pushUser(text: string) {
    setMessages((m) => [...m, { from: "user", text }]);
  }
  return { messages, typing, pushBot, pushUser };
}

function formatPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isValidPhone(input: string): boolean {
  const d = input.replace(/\D/g, "");
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  if (/^(\d)\1+$/.test(d)) return false;
  return true;
}

function formatDateInput(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function isValidDateDDMMYYYY(input: string): boolean {
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  if (year < currentYear || year > currentYear + 5) return false;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dt < today) return false;
  return true;
}


function ddmmyyyyToISO(input: string): string {
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const [d, mo, y] = [m[1], m[2], m[3]];
  return `${y}-${mo}-${d}`;
}

function dateToDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

const PAGE_BG = "linear-gradient(135deg, #FFF0F5 0%, #EFF9FF 100%)";
const HEADER_BG = "#F97316";
const AVATAR_BG = "#F97316";
const USER_BG = "linear-gradient(135deg, #10B981, #059669)";

function PublicForm() {
  const { slug } = useParams({ from: "/f/$slug" });
  const [cfg, setCfg] = useState<FormCfg | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [celebrantName, setCelebrantName] = useState("");
  const [celebrantAge, setCelebrantAge] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { messages, typing, pushBot, pushUser } = useTypingMessages();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, step]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?slug=${encodeURIComponent(slug)}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        if (!res.ok) {
          setStep("unavailable");
          return;
        }
        const data = (await res.json()) as FormCfg;
        if (!data.active) {
          setStep("unavailable");
          return;
        }
        setCfg(data);
        setStep("intro");
        await pushBot("Olá, tudo bem? 👋");
        await pushBot(
          "Precisamos de algumas informações para te passar o orçamento, vai ser bem rápido!",
        );
      } catch {
        setStep("unavailable");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function closeWidget() {
    try {
      window.parent?.postMessage({ type: "kpw-close" }, "*");
    } catch {
      // noop
    }
  }

  async function startConversation() {
    pushUser("Vamos lá");
    setStep("name");
    await pushBot("Qual o nome do(a) aniversariante?");
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!celebrantName.trim()) return;
    pushUser(celebrantName);
    setStep("age");
    const first = celebrantName.trim().split(/\s+/)[0];
    const last = first.slice(-1).toLowerCase();
    const article = last === "a" ? "a " : last === "o" ? "o " : "";
    await pushBot(`Quantos anos ${article}${first} vai fazer?`);
  }

  async function submitAge(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(celebrantAge, 10);
    if (!n || n < 1 || n > 17) return;
    pushUser(`${n} aninhos`);
    setStep("date");
    await pushBot("E qual a data para a festa?");
  }

  async function submitDate(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidDateDDMMYYYY(desiredDate)) return;
    pushUser(desiredDate);
    setStep("contact");
    await pushBot(
      "Pra finalizar, me diz seu nome e WhatsApp para te enviarmos o orçamento.",
    );
  }

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim()) return;
    if (!isValidPhone(parentPhone)) return;
    pushUser(`${parentName} · ${parentPhone}`);
    setStep("submitting");
    await pushBot("Preparando seu orçamento...");

    const url = new URL(window.location.href);
    const utm_source = url.searchParams.get("utm_source") || undefined;
    const utm_medium = url.searchParams.get("utm_medium") || undefined;
    const utm_campaign = url.searchParams.get("utm_campaign") || undefined;

    try {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
        body: JSON.stringify({
          form_slug: slug,
          celebrant_name: celebrantName,
          celebrant_age: parseInt(celebrantAge, 10),
          desired_date: ddmmyyyyToISO(desiredDate),
          parent_name: parentName,
          parent_phone: parentPhone,
          utm_source,
          utm_medium,
          utm_campaign,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "submit_failed");
      }
      setStep("done");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erro");
      setStep("error");
    }
  }

  function retry() {
    setStep("contact");
    setErrorMsg(null);
  }

  const progressByStep: Record<Step, number> = {
    loading: 0,
    intro: 1,
    name: 2,
    age: 3,
    date: 4,
    contact: 5,
    submitting: 5,
    done: 5,
    error: 5,
    unavailable: 0,
  };
  const progress = progressByStep[step];

  const headerName = cfg?.name || "Kids Point";
  const attendantName = cfg?.attendant_name?.trim() || headerName;
  const attendantAvatar = cfg?.attendant_avatar_url?.trim() || "";
  const attendantOnline = cfg?.attendant_online ?? true;
  const privacyUrl = cfg?.privacy_policy_url?.trim() || "";
  const attendantInitials = attendantName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }} className="kp-page flex flex-col">
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    }
        }
        .bubble-bot, .bubble-user { animation: popIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes fbounce {
          0%, 60%, 100% { transform: translateY(0); }
          30%            { transform: translateY(-6px); }
        }
        .fdot { width: 8px; height: 8px; background: #94A3B8; border-radius: 50%; display: inline-block; }
        .fdot:nth-child(1) { animation: fbounce 1.1s infinite; }
        .fdot:nth-child(2) { animation: fbounce 1.1s infinite 0.15s; }
        .fdot:nth-child(3) { animation: fbounce 1.1s infinite 0.30s; }
        @keyframes wapulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.4); }
          50%       { box-shadow: 0 0 0 16px rgba(37, 211, 102, 0); }
        }
        .wa-icon { animation: wapulse 2s infinite; }
        @keyframes dotpulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.55); }
          50%       { box-shadow: 0 0 0 6px rgba(37, 211, 102, 0); }
        }
        .online-dot { animation: dotpulse 2s infinite; }
        .f-input {
          width: 100%;
          border: 2px solid #E5E7EB;
          border-radius: 14px;
          padding: 14px 16px;
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s ease;
          background: white;
        }
        .f-input:focus { border-color: #F97316; }
        .f-btn-primary {
          width: 100%;
          height: 54px;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 600;
          color: white;
          border: none;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .f-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .f-btn-primary:not(:disabled):hover { transform: translateY(-1px); }
        .f-btn-orange { background: linear-gradient(135deg, #F97316, #EC4899); box-shadow: 0 4px 20px rgba(249,115,22,0.35); }
        .f-btn-orange:not(:disabled):hover { box-shadow: 0 6px 24px rgba(249,115,22,0.5); }
        .f-btn-green { background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 4px 20px rgba(16,185,129,0.35); }
        .f-btn-green:not(:disabled):hover { box-shadow: 0 6px 24px rgba(16,185,129,0.5); }
        .f-btn-inline {
          height: 50px; padding: 0 18px; border-radius: 14px; font-size: 15px; font-weight: 600;
          color: white; border: none; cursor: pointer; background: linear-gradient(135deg, #F97316, #EC4899);
          box-shadow: 0 4px 14px rgba(249,115,22,0.3);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .f-btn-inline:disabled { opacity: 0.6; cursor: not-allowed; }
        .f-btn-inline:not(:disabled):hover { transform: translateY(-1px); }

        @media (max-width: 640px) {
          .kp-page { background: white !important; }
          .kp-shell-wrap { padding: 0 !important; align-items: stretch !important; }
          .kp-shell {
            max-width: none !important;
            width: 100% !important;
            height: 100vh !important;
            height: 100dvh !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="flex-1 flex items-center justify-center p-4 kp-shell-wrap">
        <div
          className="kp-shell w-full max-w-[480px] flex flex-col bg-white rounded-3xl overflow-hidden"
          style={{
            boxShadow: "0 20px 60px -10px rgba(236, 72, 153, 0.25), 0 8px 24px -8px rgba(0,0,0,0.1)",
            height: "min(720px, calc(100vh - 32px))",
          }}
        >
          {/* HEADER */}
          <div style={{ background: HEADER_BG, padding: "14px 16px 12px" }}>
            <div className="flex items-center gap-3">
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    background: "rgba(255,255,255,0.25)",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "2px solid rgba(255,255,255,0.6)",
                  }}
                  className="flex items-center justify-center text-white font-semibold"
                >
                  {attendantAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attendantAvatar}
                      alt={attendantName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 14 }}>{attendantInitials || "KP"}</span>
                  )}
                </div>
                {attendantOnline && (
                  <span
                    className="online-dot"
                    style={{
                      position: "absolute",
                      right: -1,
                      bottom: -1,
                      width: 13,
                      height: 13,
                      background: "#25D366",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                    }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 15, fontWeight: 600, color: "white", lineHeight: 1.2 }}>
                  {attendantName}
                </div>
                <div
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}
                  className="flex items-center gap-1.5 mt-0.5"
                >
                  {attendantOnline && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        background: "#25D366",
                        borderRadius: "50%",
                        display: "inline-block",
                      }}
                    />
                  )}
                  {attendantOnline ? "Online agora" : headerName}
                </div>
              </div>
              <button
                type="button"
                onClick={closeWidget}
                aria-label="Fechar"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.18)",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
            <div className="flex gap-1.5 mt-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background:
                      i <= progress ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)",
                    transition: "background 0.3s ease",
                  }}
                />
              ))}
            </div>
          </div>


          {/* BODY */}
          {step === "loading" ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Carregando...
            </div>
          ) : step === "unavailable" ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <div className="text-5xl mb-3">🎈</div>
                <p className="text-slate-700">
                  Este formulário não está disponível no momento.
                </p>
              </div>
            </div>
          ) : step === "done" ? (
            <div className="flex-1 flex items-center justify-center px-6 py-10">
              <div className="text-center max-w-sm">
                <div
                  className="wa-icon inline-flex items-center justify-center mb-6"
                  style={{
                    width: 68,
                    height: 68,
                    background: "#25D366",
                    borderRadius: "50%",
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
                    <path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.6A11.9 11.9 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5zM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A10 10 0 1 1 22 12a10 10 0 0 1-10 10zm5.5-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7 0-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.7.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.4-.2.3-1 1-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3 4.8 4.2 1.6.7 2.2.8 3 .7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.4z" />
                  </svg>
                </div>
                <div
                  style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}
                >
                  Orçamento a caminho, {parentName}!
                </div>
                <div style={{ fontSize: 15, color: "#64748B", lineHeight: 1.65 }}>
                  Em instantes você recebe no WhatsApp as opções e valores para a data escolhida.
                  <br />
                  Fique de olho!
                </div>
              </div>
            </div>
          ) : step === "error" ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <p className="text-slate-700 mb-4">Algo deu errado. Por favor, tente novamente.</p>
                {errorMsg && (
                  <p className="text-xs text-slate-400 mb-4 break-all">{errorMsg}</p>
                )}
                <button className="f-btn-primary f-btn-orange" onClick={retry}>
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* MESSAGES */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
                {messages.map((m, i) => (
                  <Bubble
                    key={i}
                    from={m.from}
                    avatarUrl={attendantAvatar}
                    initials={attendantInitials || "KP"}
                  >
                    {m.text}
                  </Bubble>
                ))}
                {typing && (
                  <Bubble from="bot" avatarUrl={attendantAvatar} initials={attendantInitials || "KP"}>
                    <span className="inline-flex gap-1.5 items-center py-1">
                      <span className="fdot" />
                      <span className="fdot" />
                      <span className="fdot" />
                    </span>
                  </Bubble>
                )}
              </div>

              {/* INPUT */}
              <div
                className="px-4 py-3"
                style={{ borderTop: "1px solid #F1F5F9", background: "white" }}
              >
                {step === "intro" && (
                  <>
                    <button
                      className="f-btn-primary f-btn-orange"
                      onClick={startConversation}
                      disabled={typing}
                    >
                      Vamos lá
                    </button>
                    {privacyUrl && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "#94A3B8",
                          textAlign: "center",
                          marginTop: 8,
                          lineHeight: 1.4,
                        }}
                      >
                        Clicando acima você aceita nossas{" "}
                        <a
                          href={privacyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#F97316", textDecoration: "underline" }}
                        >
                          Políticas de privacidade
                        </a>
                        .
                      </p>
                    )}
                  </>
                )}
                {step === "name" && (
                  <form onSubmit={submitName} className="flex gap-2">
                    <input
                      autoFocus
                      className="f-input"
                      placeholder="Nome da criança"
                      value={celebrantName}
                      onChange={(e) => setCelebrantName(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="f-btn-inline"
                      disabled={typing || !celebrantName.trim()}
                    >
                      Enviar
                    </button>
                  </form>
                )}
                {step === "age" && (
                  <form onSubmit={submitAge} className="flex gap-2">
                    <input
                      autoFocus
                      type="number"
                      min={1}
                      max={17}
                      className="f-input"
                      placeholder="Ex: 5"
                      value={celebrantAge}
                      onChange={(e) => setCelebrantAge(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="f-btn-inline"
                      disabled={typing || !celebrantAge}
                    >
                      Enviar
                    </button>
                  </form>
                )}
                {step === "date" && (
                  <form onSubmit={submitDate}>
                    <div className="flex gap-2">
                      <div className="flex-1 flex gap-2">
                        <input
                          autoFocus
                          type="text"
                          inputMode="numeric"
                          maxLength={10}
                          className="f-input flex-1"
                          placeholder="DD/MM/AAAA"
                          value={desiredDate}
                          onChange={(e) => setDesiredDate(formatDateInput(e.target.value))}
                        />
                        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="f-btn-inline"
                              style={{ padding: "0 12px", minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
                              aria-label="Abrir calendário"
                            >
                              <CalendarIcon className="w-5 h-5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                            <Calendar
                              mode="single"
                              selected={
                                isValidDateDDMMYYYY(desiredDate)
                                  ? new Date(ddmmyyyyToISO(desiredDate) + "T00:00:00")
                                  : undefined
                              }
                              onSelect={(date) => {
                                if (date) {
                                  setDesiredDate(dateToDDMMYYYY(date));
                                  setDatePickerOpen(false);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <button
                        type="submit"
                        className="f-btn-inline"
                        disabled={typing || !isValidDateDDMMYYYY(desiredDate)}
                      >
                        Enviar
                      </button>
                    </div>
                    {desiredDate && !isValidDateDDMMYYYY(desiredDate) && (
                      <div style={{ fontSize: 12, color: "#DC2626", paddingLeft: 4, marginTop: 6 }}>
                        Informe uma data válida no formato DD/MM/AAAA.
                      </div>
                    )}
                  </form>
                )}
                {step === "contact" && (
                  <form onSubmit={submitContact} className="space-y-2">
                    <input
                      autoFocus
                      className="f-input"
                      placeholder="Seu nome"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      className="f-input"
                      placeholder="WhatsApp (ex: (11) 91234-5678)"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(formatPhone(e.target.value))}
                    />
                    {parentPhone && !isValidPhone(parentPhone) && (
                      <div style={{ fontSize: 12, color: "#DC2626", paddingLeft: 4 }}>
                        Informe um WhatsApp válido com DDD.
                      </div>
                    )}
                    <button
                      type="submit"
                      className="f-btn-primary f-btn-green"
                      disabled={typing || !parentName.trim() || !isValidPhone(parentPhone)}
                    >
                      Receber orçamento
                    </button>
                  </form>
                )}
                {step === "submitting" && (
                  <div className="text-center text-sm text-slate-500 py-3">Verificando...</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({
  from,
  children,
  avatarUrl,
  initials,
}: {
  from: "bot" | "user";
  children: React.ReactNode;
  avatarUrl?: string;
  initials?: string;
}) {
  if (from === "bot") {
    return (
      <div className="flex items-end gap-2 bubble-bot">
        <div
          style={{
            width: 32,
            height: 32,
            background: AVATAR_BG,
            borderRadius: "50%",
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 600,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials || "KP"
          )}
        </div>
        <div
          style={{
            background: "#F1F5F9",
            borderRadius: "18px 18px 18px 4px",
            padding: "10px 14px",
            fontSize: 15,
            lineHeight: 1.55,
            color: "#1a1a2e",
            maxWidth: "80%",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end bubble-user">
      <div
        style={{
          background: USER_BG,
          color: "white",
          borderRadius: "18px 18px 4px 18px",
          padding: "10px 14px",
          fontSize: 14.5,
          fontWeight: 600,
          maxWidth: "80%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
