import { getStore } from "@netlify/blobs";

// Roda automaticamente a cada 5 minutos (configurado em "config" no fim do arquivo).
// Objetivo: avisar o hóspede que a vaga está prestes a expirar, se ele ainda não pagou.

const AVISAR_QUANDO_FALTAR_MINUTOS = 5; // manda o lembrete quando faltar isso para expirar o hold de 15min

function montarEmailLembrete(item, chave) {
  const [data, horario] = chave.split("_");
  const dataFormatada = data.split("-").reverse().join("/");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0;">
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #ddd;">
      <p style="text-transform: uppercase; letter-spacing: 2px; font-size: 11px; color: #BA933C;">Casa Vinnus</p>
      <h2 style="color: #551314; margin: 8px 0 16px;">Sua vaga ainda está esperando por você</h2>
      <p style="font-family: Arial, sans-serif; font-size: 14px; color: #464244;">Você começou uma reserva para <strong>${dataFormatada} às ${horario}</strong>, mas o pagamento ainda não foi concluído. Sua vaga fica garantida só por mais alguns minutos.</p>
      <p style="font-family: Arial, sans-serif; font-size: 14px; color: #464244;">Se ainda quiser confirmar, finalize o pagamento o quanto antes. Se não conseguir a tempo, é só fazer uma nova reserva no site.</p>
      <p style="font-family: Arial, sans-serif; font-size: 12px; color: #8A8178; margin-top: 20px;">Dúvidas? WhatsApp: <a href="https://wa.me/5524998607810" style="color:#551314;">(24) 99860-7810</a></p>
    </div>
</body>
</html>`;
}

async function enviarEmail(destinatarios, assunto, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !destinatarios || destinatarios.length === 0) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: "Casa Vinnus <onboarding@resend.dev>", to: destinatarios, subject: assunto, html }),
    });
  } catch (e) {
    console.error("Falha ao enviar lembrete:", e);
  }
}

export default async () => {
  const store = getStore("reservas-casa-vinnus");
  const agora = Date.now();
  const limiteInferior = agora + (AVISAR_QUANDO_FALTAR_MINUTOS - 2) * 60000;
  const limiteSuperior = agora + (AVISAR_QUANDO_FALTAR_MINUTOS + 2) * 60000;

  const { blobs } = await store.list();

  for (const b of blobs) {
    let resultado;
    try {
      resultado = await store.getWithMetadata(b.key, { type: "json" });
    } catch {
      continue;
    }
    if (!resultado) continue;

    const registro = resultado.data || { itens: [] };
    let mudou = false;

    for (const item of registro.itens || []) {
      if (
        item.status === "pendente" &&
        !item.lembreteEnviado &&
        item.expiraEm > limiteInferior &&
        item.expiraEm <= limiteSuperior
      ) {
        if (item.email) {
          await enviarEmail([item.email], "Sua vaga na Casa Vinnus está prestes a expirar", montarEmailLembrete(item, b.key));
        }
        item.lembreteEnviado = true;
        mudou = true;
      }
    }

    if (mudou) {
      try {
        const opcoes = resultado.etag ? { onlyIfMatch: resultado.etag } : { onlyIfNew: true };
        await store.setJSON(b.key, registro, opcoes);
      } catch {
        // se der conflito de concorrência, o próximo ciclo (5 min depois) tenta de novo
      }
    }
  }

  return new Response("ok");
};

export const config = { schedule: "*/5 * * * *" };
