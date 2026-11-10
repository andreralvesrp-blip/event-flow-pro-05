import { HOUSES } from '@/lib/personal-dates';
import pageCss from '@/styles/datas-kids-point.css?url';

// Tela pública para links de /datas/ inválidos, expirados ou de oportunidade apagada.
// Nunca leva ao login do CRM: o único caminho é o WhatsApp da Ud. Bosque.
export const bosqueWhatsappUrl = () =>
  `https://wa.me/${HOUSES.bosque.whatsapp}?text=${encodeURIComponent('Olá! Quero falar sobre uma data para a festa na Ud. Bosque.')}`;

export function LinkUnavailable() {
  return (
    <>
      <link rel="stylesheet" href={pageCss} precedence="default" />
      <div className="kpd">
        <div className="app short">
          <div className="band">
            <div className="bar"><i /><em className="brand">Kids Point</em></div>
            <strong>Este link não está mais disponível</strong>
          </div>
          <div className="main">
            <p className="hi">Fale com a nossa equipe, que ajudamos a encontrar a data da festa.</p>
          </div>
          <div className="foot">
            <a className="btn w" href={bosqueWhatsappUrl()} target="_blank" rel="noopener noreferrer" style={{ display: "flex", justifyContent: "center", textDecoration: "none" }}>Falar no WhatsApp da Ud. Bosque</a>
          </div>
        </div>
      </div>
    </>
  );
}
