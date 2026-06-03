import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/avaliar/$slug")({
  ssr: false,
  component: PublicNps,
});

type UnitInfo = {
  unit_id: string;
  name: string;
  logo_url: string | null;
  google_reviews_url: string | null;
};

type Experience = "loved" | "ok" | "improve";

// Steps:
// "loading" | "notfound"
// shared: "experience"
// loved branch: "loved_comment" -> "loved_contact" -> "loved_google"? -> "thanks"
// ok/improve branch: "feedback_comment" -> "feedback_contact" -> "thanks"
type Step =
  | "loading"
  | "notfound"
  | "experience"
  | "loved_comment"
  | "loved_contact"
  | "loved_google"
  | "feedback_comment"
  | "feedback_contact"
  | "thanks";

const PAGE_BG = "linear-gradient(135deg, #FFF0F5 0%, #EFF9FF 100%)";
const PRIMARY = "#16A34A"; // verde
const HEADER_ACCENT = "#F97316"; // laranja para o quadrado

function PublicNps() {
  const { slug } = useParams({ from: "/avaliar/$slug" });
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [responseId, setResponseId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_public_unit", { _slug: slug });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setStep("notfound");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setUnit(row as UnitInfo);
      setStep("experience");
    })();
  }, [slug]);

  const headerName = unit?.name || "Kids Point";
  const initial = (headerName.trim()[0] || "?").toUpperCase();

  // Progress
  const progress = useMemo(() => {
    if (step === "experience") return 25;
    if (step === "loved_comment" || step === "feedback_comment") return 50;
    if (step === "loved_contact" || step === "feedback_contact") return 75;
    if (step === "loved_google") return 90;
    if (step === "thanks") return 100;
    return 0;
  }, [step]);

  async function doSubmit(opts: { wants_budget: boolean }) {
    if (!experience) return;
    setSubmitting(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc("submit_nps_response", {
      _slug: slug,
      _score: null as unknown as number,
      _experience: experience,
      _comment: comment,
      _name: name,
      _whatsapp: whatsapp,
      _wants_google_review: experience === "loved" && !!unit?.google_reviews_url,
      _wants_budget: opts.wants_budget && whatsapp.trim().length > 0,
    });
    setSubmitting(false);
    if (error || !data) {
      setErrorMsg(error?.message ?? "Erro ao enviar");
      return false;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setResponseId(row.response_id);
    return true;
  }

  async function handleLovedContact(wantsBudget: boolean) {
    const ok = await doSubmit({ wants_budget: wantsBudget });
    if (!ok) return;
    if (unit?.google_reviews_url) {
      setStep("loved_google");
    } else {
      setStep("thanks");
    }
  }

  async function handleFeedbackSubmit() {
    const ok = await doSubmit({ wants_budget: false });
    if (!ok) return;
    setStep("thanks");
  }

  async function goToGoogle() {
    if (responseId) {
      await supabase.rpc("mark_nps_google_redirect", { _response_id: responseId });
    }
    if (unit?.google_reviews_url) {
      window.open(unit.google_reviews_url, "_blank", "noopener,noreferrer");
    }
    setStep("thanks");
  }

  function pickExperience(exp: Experience) {
    setExperience(exp);
    if (exp === "loved") setStep("loved_comment");
    else setStep("feedback_comment");
  }

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }} className="flex flex-col">
      <style>{`
        .a-input {
          width: 100%; border: 2px solid #E5E7EB; border-radius: 14px;
          padding: 12px 16px; font-size: 15px; font-family: inherit;
          outline: none; transition: border-color 0.2s ease; background: white;
        }
        .a-input:focus { border-color: ${PRIMARY}; }
        .a-btn {
          width: 100%; height: 52px; border-radius: 14px; font-size: 16px; font-weight: 600;
          color: white; border: none; cursor: pointer;
          background: ${PRIMARY};
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .a-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .a-btn:not(:disabled):hover { transform: translateY(-1px); }
        .a-btn-secondary {
          width: 100%; height: 48px; border-radius: 14px; font-size: 15px; font-weight: 500;
          color: #475569; background: white; border: 1.5px solid #E2E8F0; cursor: pointer;
        }
        .a-btn-secondary:hover { background: #F8FAFC; }
        .a-btn-google {
          background: linear-gradient(135deg, #4285F4, #34A853);
        }
        .exp-card {
          width: 100%; padding: 18px 20px; border-radius: 16px; border: 2px solid #E5E7EB;
          background: white; font-size: 16px; font-weight: 600; color: #1E293B;
          cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 14px;
          text-align: left;
        }
        .exp-card:hover { border-color: ${PRIMARY}; transform: translateY(-1px); }
        .exp-icon {
          width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center;
          justify-content: center; font-size: 20px; flex-shrink: 0;
        }
      `}</style>

      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="w-full max-w-[480px] flex flex-col bg-white rounded-3xl overflow-hidden"
          style={{
            boxShadow:
              "0 20px 60px -10px rgba(236, 72, 153, 0.25), 0 8px 24px -8px rgba(0,0,0,0.1)",
          }}
        >
          {/* HEADER */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div
                style={{ background: HEADER_ACCENT }}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-slate-800 leading-tight truncate">
                  {headerName}
                </div>
                <div className="text-[12px] text-slate-500">Resposta rápida e segura</div>
              </div>
            </div>
            {/* Progress */}
            {progress > 0 && (
              <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: PRIMARY }}
                />
              </div>
            )}
          </div>

          {/* BODY */}
          <div className="p-5">
            {step === "loading" && (
              <div className="text-center text-slate-500 py-10 text-sm">Carregando...</div>
            )}

            {step === "notfound" && (
              <div className="text-center py-10">
                <div className="text-5xl mb-3">🎈</div>
                <p className="text-slate-700">Página não encontrada.</p>
              </div>
            )}

            {/* TELA 1 */}
            {step === "experience" && (
              <div className="space-y-4">
                <h1 className="text-[19px] font-bold text-slate-800 leading-snug">
                  Como foi sua experiência no {headerName} hoje?
                </h1>
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    className="exp-card"
                    onClick={() => pickExperience("loved")}
                  >
                    <span className="exp-icon" style={{ background: "#FEE2E2", color: "#DC2626" }}>
                      ❤️
                    </span>
                    <span>Adorei</span>
                  </button>
                  <button type="button" className="exp-card" onClick={() => pickExperience("ok")}>
                    <span className="exp-icon" style={{ background: "#DCFCE7", color: "#16A34A" }}>
                      ✓
                    </span>
                    <span>Foi ok</span>
                  </button>
                  <button
                    type="button"
                    className="exp-card"
                    onClick={() => pickExperience("improve")}
                  >
                    <span className="exp-icon" style={{ background: "#FEF3C7", color: "#B45309" }}>
                      ✦
                    </span>
                    <span>Não gostei</span>
                  </button>
                </div>
              </div>
            )}

            {/* ===== Ramificação ADOREI ===== */}

            {step === "loved_comment" && (
              <div className="space-y-4">
                <h1 className="text-[19px] font-bold text-slate-800 leading-snug">
                  Ficamos muito felizes que você tenha gostado! 😊
                </h1>
                <textarea
                  className="a-input"
                  placeholder="O que mais você gostou?"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  type="button"
                  className="a-btn"
                  onClick={() => setStep("loved_contact")}
                >
                  Continuar
                </button>
              </div>
            )}

            {step === "loved_contact" && (
              <div className="space-y-4">
                <h1 className="text-[19px] font-bold text-slate-800 leading-snug">
                  Receba nosso contato para orçamento
                </h1>
                <p className="text-sm text-slate-600">
                  Preencha apenas se você quiser que nossa equipe entre em contato para
                  entender seu evento e enviar informações ou orçamento.
                </p>
                <input
                  className="a-input"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="a-input"
                  type="tel"
                  placeholder="Seu WhatsApp com DDD"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
                {errorMsg && <p className="text-xs text-red-600 break-all">{errorMsg}</p>}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    className="a-btn"
                    disabled={submitting || whatsapp.trim().length === 0}
                    onClick={() => handleLovedContact(true)}
                  >
                    {submitting ? "Enviando..." : "Quero receber contato e orçamento"}
                  </button>
                  <button
                    type="button"
                    className="a-btn-secondary"
                    disabled={submitting}
                    onClick={() => handleLovedContact(false)}
                  >
                    Não estou planejando evento
                  </button>
                </div>
              </div>
            )}

            {step === "loved_google" && (
              <div className="space-y-4 text-center py-2">
                <div className="text-5xl">⭐</div>
                <h1 className="text-[19px] font-bold text-slate-800 leading-snug">
                  Quer ajudar outras pessoas a escolherem com mais confiança no Google?
                </h1>
                <p className="text-sm text-slate-600">Leva menos de 1 minuto.</p>
                <div className="space-y-2 pt-2">
                  <button type="button" className="a-btn a-btn-google" onClick={goToGoogle}>
                    Avaliar no Google
                  </button>
                  <button
                    type="button"
                    className="a-btn-secondary"
                    onClick={() => setStep("thanks")}
                  >
                    Agora não
                  </button>
                </div>
              </div>
            )}

            {/* ===== Ramificação FOI OK / NÃO GOSTEI ===== */}

            {step === "feedback_comment" && (
              <div className="space-y-4">
                <h1 className="text-[19px] font-bold text-slate-800 leading-snug">
                  Obrigado pela sinceridade. O que mais te incomodou e/ou poderia ter sido
                  melhor?
                </h1>
                <textarea
                  className="a-input"
                  placeholder="Queremos te ouvir. Escreva aqui sua sugestão."
                  rows={5}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <p className="text-xs text-slate-500 leading-relaxed">
                  Fique tranquilo(a). Essa resposta será enviada de forma privada para o dono
                  da empresa como sugestão de melhoria.
                </p>
                <button
                  type="button"
                  className="a-btn"
                  onClick={() => setStep("feedback_contact")}
                >
                  Continuar
                </button>
              </div>
            )}

            {step === "feedback_contact" && (
              <div className="space-y-4">
                <h1 className="text-[19px] font-bold text-slate-800 leading-snug">
                  Se preferir, podemos te chamar no WhatsApp para entender melhor sua
                  experiência.
                </h1>
                <input
                  className="a-input"
                  placeholder="Nome (opcional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="a-input"
                  type="tel"
                  placeholder="WhatsApp (opcional)"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
                {errorMsg && <p className="text-xs text-red-600 break-all">{errorMsg}</p>}
                <button
                  type="button"
                  className="a-btn"
                  disabled={submitting}
                  onClick={handleFeedbackSubmit}
                >
                  {submitting ? "Enviando..." : "Enviar feedback"}
                </button>
              </div>
            )}

            {/* ===== FINAL ===== */}

            {step === "thanks" && (
              <div className="text-center py-8 space-y-3">
                <div className="text-5xl">🙏</div>
                <div className="text-lg font-bold text-slate-800">
                  Obrigado pelo seu feedback!
                </div>
                <p className="text-slate-600 text-sm">
                  {experience === "loved"
                    ? "Sua opinião nos ajuda a entregar uma experiência ainda melhor."
                    : "Vamos analisar com carinho para melhorar cada vez mais."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
