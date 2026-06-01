import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/avaliar/$slug")({
  component: PublicNps,
});

type UnitInfo = {
  unit_id: string;
  name: string;
  logo_url: string | null;
  google_reviews_url: string | null;
};

type Experience = "loved" | "ok" | "improve";
type Step = "loading" | "form" | "submitting" | "thanks" | "google" | "notfound";

const PAGE_BG = "linear-gradient(135deg, #FFF0F5 0%, #EFF9FF 100%)";
const HEADER_BG = "#F97316";

function PublicNps() {
  const { slug } = useParams({ from: "/avaliar/$slug" });
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [step, setStep] = useState<Step>("loading");

  const [experience, setExperience] = useState<Experience | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [wantsBudget, setWantsBudget] = useState(false);

  const [responseId, setResponseId] = useState<string | null>(null);
  const [classification, setClassification] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_public_unit", { _slug: slug });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setStep("notfound");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setUnit(row as UnitInfo);
      setStep("form");
    })();
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;
    setStep("submitting");
    setErrorMsg(null);
    const { data, error } = await supabase.rpc("submit_nps_response", {
      _slug: slug,
      _score: score,
      _experience: experience ?? "",
      _comment: comment,
      _name: name,
      _whatsapp: whatsapp,
      _wants_google_review: score >= 9 && !!unit?.google_reviews_url,
      _wants_budget: wantsBudget && whatsapp.trim().length > 0,
    });
    if (error || !data) {
      setErrorMsg(error?.message ?? "Erro ao enviar");
      setStep("form");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setResponseId(row.response_id);
    setClassification(row.classification);
    if (row.classification === "promotor" && unit?.google_reviews_url) {
      setStep("google");
    } else {
      setStep("thanks");
    }
  }

  async function goToGoogle() {
    if (responseId) {
      await supabase.rpc("mark_nps_google_redirect", { _response_id: responseId });
    }
    if (unit?.google_reviews_url) {
      window.open(unit.google_reviews_url, "_blank", "noopener,noreferrer");
    }
  }

  const headerName = unit?.name || "Kids Point";

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }} className="flex flex-col">
      <style>{`
        .a-input {
          width: 100%; border: 2px solid #E5E7EB; border-radius: 14px;
          padding: 12px 16px; font-size: 15px; font-family: inherit;
          outline: none; transition: border-color 0.2s ease; background: white;
        }
        .a-input:focus { border-color: #F97316; }
        .a-btn {
          width: 100%; height: 52px; border-radius: 16px; font-size: 16px; font-weight: 600;
          color: white; border: none; cursor: pointer;
          background: linear-gradient(135deg, #F97316, #EC4899);
          box-shadow: 0 4px 20px rgba(249,115,22,0.35);
          transition: transform 0.15s ease;
        }
        .a-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .a-btn:not(:disabled):hover { transform: translateY(-1px); }
        .a-btn-google {
          background: linear-gradient(135deg, #4285F4, #34A853);
          box-shadow: 0 4px 20px rgba(66,133,244,0.35);
        }
        .exp-btn {
          flex: 1; padding: 14px 8px; border-radius: 14px; border: 2px solid #E5E7EB;
          background: white; font-size: 14px; font-weight: 600; color: #334155;
          cursor: pointer; transition: all 0.15s ease;
        }
        .exp-btn.active { border-color: #F97316; background: #FFF7ED; color: #C2410C; }
        .score-btn {
          width: 100%; aspect-ratio: 1; border-radius: 10px; border: 2px solid #E5E7EB;
          background: white; font-size: 15px; font-weight: 600; color: #334155;
          cursor: pointer; transition: all 0.15s ease;
        }
        .score-btn.active { border-color: #F97316; background: #F97316; color: white; }
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
          <div style={{ background: HEADER_BG, padding: "16px" }}>
            <div className="flex items-center gap-3">
              {unit?.logo_url ? (
                <img
                  src={unit.logo_url}
                  alt={headerName}
                  style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: 10,
                  }}
                  className="flex items-center justify-center text-white text-[18px]"
                >
                  ⭐
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 15, fontWeight: 600, color: "white", lineHeight: 1.2 }}>
                  {headerName}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>
                  Sua opinião sobre a festa
                </div>
              </div>
            </div>
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

            {(step === "form" || step === "submitting") && (
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    Como foi sua experiência na festa?
                  </div>
                  <div className="flex gap-2">
                    {(
                      [
                        { v: "loved", label: "Amei" },
                        { v: "ok", label: "Foi ok" },
                        { v: "improve", label: "Pode melhorar" },
                      ] as { v: Experience; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setExperience(opt.v)}
                        className={`exp-btn ${experience === opt.v ? "active" : ""}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    De 0 a 10, o quanto você recomendaria a {headerName} para um amigo?
                  </div>
                  <div className="grid grid-cols-11 gap-1.5">
                    {Array.from({ length: 11 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setScore(i)}
                        className={`score-btn ${score === i ? "active" : ""}`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>nada provável</span>
                    <span>muito provável</span>
                  </div>
                </div>

                <div>
                  <textarea
                    className="a-input"
                    placeholder="Quer deixar um comentário? (opcional)"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="a-input"
                    placeholder="Seu nome (opcional)"
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
                </div>

                <label className="flex gap-2 items-start text-sm text-slate-700 bg-slate-50 rounded-xl p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantsBudget}
                    onChange={(e) => setWantsBudget(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Quer fazer uma festa também? Deixa seu contato que a gente monta um orçamento
                    pra você.
                  </span>
                </label>

                {errorMsg && (
                  <p className="text-xs text-red-600 break-all">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  className="a-btn"
                  disabled={step === "submitting" || score === null}
                >
                  {step === "submitting" ? "Enviando..." : "Enviar avaliação"}
                </button>
              </form>
            )}

            {step === "thanks" && (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">🙏</div>
                <div className="text-lg font-bold text-slate-800 mb-2">
                  Obrigado pelo feedback!
                </div>
                <p className="text-slate-600 text-sm">
                  {classification === "detrator"
                    ? "Vamos analisar com carinho o que pode melhorar."
                    : "Sua opinião nos ajuda a entregar uma experiência ainda melhor."}
                </p>
              </div>
            )}

            {step === "google" && (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">⭐</div>
                <div className="text-lg font-bold text-slate-800 mb-2">
                  Que ótimo saber disso!
                </div>
                <p className="text-slate-600 text-sm mb-5">
                  Quer compartilhar essa experiência no Google? Leva menos de 1 minuto e ajuda
                  muita gente.
                </p>
                <button className="a-btn a-btn-google" onClick={goToGoogle}>
                  Avaliar no Google
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
