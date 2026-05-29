import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/f/$slug")({
  component: PublicForm,
});

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-intake`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type FormCfg = { name: string; welcome_message: string; active: boolean };

type Msg = { from: "bot" | "user"; text: string };

type Step = "loading" | "intro" | "name" | "age" | "date" | "contact" | "submitting" | "done" | "error" | "unavailable";

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
  return { messages, typing, setTyping, pushBot, pushUser };
}

function PublicForm() {
  const { slug } = useParams({ from: "/f/$slug" });
  const [cfg, setCfg] = useState<FormCfg | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [celebrantName, setCelebrantName] = useState("");
  const [celebrantAge, setCelebrantAge] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { messages, typing, pushBot, pushUser } = useTypingMessages();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, step]);

  // load form config
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
        await pushBot(data.welcome_message);
      } catch {
        setStep("unavailable");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function startConversation() {
    pushUser("Sim, vamos! 🎊");
    setStep("name");
    await pushBot("Qual o nome do aniversariante?");
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!celebrantName.trim()) return;
    pushUser(celebrantName);
    setStep("age");
    await pushBot(`Quantos aninhos o(a) ${celebrantName} vai fazer?`);
  }

  async function submitAge(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(celebrantAge, 10);
    if (!n || n < 1 || n > 17) return;
    pushUser(`${n} aninhos`);
    setStep("date");
    await pushBot("Que data você tem em mente para a festa?");
  }

  async function submitDate(e: React.FormEvent) {
    e.preventDefault();
    if (!desiredDate) return;
    const [y, m, d] = desiredDate.split("-");
    pushUser(`${d}/${m}/${y}`);
    setStep("contact");
    await pushBot(
      "Para verificar a disponibilidade e entrar em contato, me passa seu nome e WhatsApp.",
    );
  }

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !parentPhone.trim()) return;
    pushUser(`${parentName} · ${parentPhone}`);
    setStep("submitting");
    await pushBot("Verificando a disponibilidade...");

    // read UTM
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
          desired_date: desiredDate,
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

  // progress 1..5
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

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-slate-500 text-sm">
        Carregando...
      </div>
    );
  }

  if (step === "unavailable") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🎈</div>
          <p className="text-slate-700">
            Este formulário não está disponível no momento.
          </p>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-4">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9">
              <path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.6A11.9 11.9 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5zM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A10 10 0 1 1 22 12a10 10 0 0 1-10 10zm5.5-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7 0-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.7.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.4-.2.3-1 1-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3 4.8 4.2 1.6.7 2.2.8 3 .7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.4z" />
            </svg>
          </div>
          <p className="text-slate-800 text-base">
            Perfeito, <strong>{parentName}</strong>! 📲
            <br />
            Em instantes você vai receber uma mensagem no WhatsApp com o resultado. Fique de
            olho!
          </p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-slate-700 mb-4">
            Algo deu errado. Por favor, tente novamente.
          </p>
          {errorMsg && (
            <p className="text-xs text-slate-400 mb-4 break-all">{errorMsg}</p>
          )}
          <Button onClick={retry}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* progress */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-1 bg-emerald-500 transition-all duration-500"
          style={{ width: `${(progress / 5) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="w-full max-w-[480px] flex flex-col">
          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
            {messages.map((m, i) => (
              <Bubble key={i} from={m.from}>
                {m.text}
              </Bubble>
            ))}
            {typing && (
              <Bubble from="bot">
                <TypingDots />
              </Bubble>
            )}
          </div>

          {/* input area */}
          <div className="border-t border-slate-100 bg-white px-4 py-3">
            {step === "intro" && (
              <Button className="w-full" onClick={startConversation} disabled={typing}>
                Sim, vamos! 🎊
              </Button>
            )}
            {step === "name" && (
              <form onSubmit={submitName} className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Nome da criança"
                  value={celebrantName}
                  onChange={(e) => setCelebrantName(e.target.value)}
                />
                <Button type="submit" disabled={typing || !celebrantName.trim()}>
                  Enviar
                </Button>
              </form>
            )}
            {step === "age" && (
              <form onSubmit={submitAge} className="flex gap-2">
                <Input
                  autoFocus
                  type="number"
                  min={1}
                  max={17}
                  placeholder="Ex: 5"
                  value={celebrantAge}
                  onChange={(e) => setCelebrantAge(e.target.value)}
                />
                <Button type="submit" disabled={typing || !celebrantAge}>
                  Enviar
                </Button>
              </form>
            )}
            {step === "date" && (
              <form onSubmit={submitDate} className="flex gap-2">
                <Input
                  autoFocus
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                />
                <Button type="submit" disabled={typing || !desiredDate}>
                  Enviar
                </Button>
              </form>
            )}
            {step === "contact" && (
              <form onSubmit={submitContact} className="space-y-2">
                <Input
                  autoFocus
                  placeholder="Seu nome"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
                <Input
                  type="tel"
                  placeholder="WhatsApp (ex: 11 91234-5678)"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={typing || !parentName.trim() || !parentPhone.trim()}
                >
                  Verificar disponibilidade →
                </Button>
              </form>
            )}
            {step === "submitting" && (
              <div className="text-center text-sm text-slate-500 py-2">
                Verificando...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ from, children }: { from: "bot" | "user"; children: React.ReactNode }) {
  if (from === "bot") {
    return (
      <div className="flex items-end gap-2">
        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-base shrink-0">
          🎉
        </div>
        <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%] text-sm">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div className="bg-emerald-500 text-white rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%] text-sm">
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center">
      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
    </span>
  );
}
