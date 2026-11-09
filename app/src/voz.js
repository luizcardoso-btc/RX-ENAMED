// Conversa por voz na estação, sem custo: usa o reconhecimento de fala e a síntese de voz do próprio navegador
// (Web Speech API). Nada é enviado para serviços pagos; no Chrome e no Edge o reconhecimento é feito pelo navegador.
// A prova é em português, então ouvimos e falamos sempre em pt-BR, mesmo com a interface em espanhol.
import { useState, useEffect, useRef } from './react.js';

const Reconhecimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const temReconhecimento = () => !!Reconhecimento;
export const temSintese = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

const CHAVE = 'rx-voz:v1';
export function lerPreferencias() {
  try { return { falarPaciente: true, continuo: false, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch { return { falarPaciente: true, continuo: false }; }
}
export function salvarPreferencias(p) {
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem armazenamento */ }
}

// Vozes femininas e masculinas mais comuns em pt-BR (Windows, macOS, Android, Chrome).
const FEMININAS = /(female|mulher|maria|francisca|luciana|vit[oó]ria|thalita|let[ií]cia|helo[ií]sa|camila|fernanda|joana|raquel|google portugu[eê]s do brasil)/i;
const MASCULINAS = /(male|homem|daniel|ant[oô]nio|felipe|ricardo|donato|fabio|humberto|julio|valerio)/i;

function escolherVoz(sexo) {
  const vozes = window.speechSynthesis.getVoices().filter((v) => /^pt(-|_)?BR/i.test(v.lang) || /^pt$/i.test(v.lang));
  if (!vozes.length) return null;
  const alvo = sexo === 'feminino' ? FEMININAS : sexo === 'masculino' ? MASCULINAS : null;
  return (alvo && vozes.find((v) => alvo.test(v.name) && !(sexo === 'feminino' && /\bmale\b/i.test(v.name)))) || vozes.find((v) => v.localService) || vozes[0];
}

/** Lê o texto em voz alta com uma voz que combine com o paciente (criança: voz mais aguda). Chama aoTerminar no fim. */
export function falar(texto, { sexo, idade, aoTerminar } = {}) {
  if (!temSintese() || !texto) { aoTerminar?.(); return; }
  // Qualquer falha da síntese do navegador só desliga a voz: nunca pode derrubar a estação.
  try { falarSemProteger(texto, { sexo, idade, aoTerminar }); } catch { aoTerminar?.(); }
}
function falarSemProteger(texto, { sexo, idade, aoTerminar }) {
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(String(texto).replace(/\s+/g, ' ').trim());
  u.lang = 'pt-BR';
  const voz = escolherVoz(sexo);
  if (voz) u.voice = voz;
  const crianca = typeof idade === 'number' ? idade < 12 : /mes|dia|ano/.test(String(idade || '')) && parseInt(idade, 10) < 12;
  u.pitch = crianca ? 1.5 : sexo === 'feminino' && voz && !FEMININAS.test(voz.name) ? 1.25 : 1;
  u.rate = 1;
  let terminou = false;
  const fim = () => { if (!terminou) { terminou = true; aoTerminar?.(); } };
  u.onend = fim;
  u.onerror = fim;
  s.speak(u);
}
export const pararFala = () => { try { if (temSintese()) window.speechSynthesis.cancel(); } catch { /* sem síntese */ } };

/**
 * Ditado: enquanto ouve, devolve o texto parcial (para mostrar na caixa) e, quando a pessoa para de falar,
 * entrega a frase final em aoFinal. Uma frase por vez, como numa conversa.
 */
export function useDitado({ aoParcial, aoFinal }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState('');
  const rec = useRef(null);
  const callbacks = useRef({ aoParcial, aoFinal });
  callbacks.current = { aoParcial, aoFinal };

  useEffect(() => () => { try { rec.current?.abort(); } catch { /* já parado */ } }, []);

  const iniciar = () => {
    if (!Reconhecimento || ouvindo) return;
    setErro('');
    pararFala();
    const r = new Reconhecimento();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let final = '';
    r.onresult = (ev) => {
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const trecho = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += trecho; else parcial += trecho;
      }
      callbacks.current.aoParcial?.((final + parcial).trim());
    };
    r.onerror = (ev) => {
      setErro({
        'not-allowed': 'Permita o uso do microfone para falar com o paciente.',
        'service-not-allowed': 'Permita o uso do microfone para falar com o paciente.',
        'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo.',
        'audio-capture': 'Nenhum microfone encontrado.',
        network: 'O reconhecimento de voz precisa de internet neste navegador.',
      }[ev.error] || '');
    };
    r.onend = () => {
      setOuvindo(false);
      rec.current = null;
      if (final.trim()) callbacks.current.aoFinal?.(final.trim());
    };
    rec.current = r;
    try { r.start(); setOuvindo(true); } catch { setOuvindo(false); }
  };
  const parar = () => { try { rec.current?.stop(); } catch { /* já parado */ } };
  return { ouvindo, erro, iniciar, parar, disponivel: !!Reconhecimento };
}
