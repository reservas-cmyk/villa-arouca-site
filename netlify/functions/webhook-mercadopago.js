import { getStore } from "@netlify/blobs";

function montarVoucherHtml(item, chave) {
  const [data, horario] = chave.split("_");
  const dataFormatada = data.split("-").reverse().join("/");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0;">
  <div style="background:#F5F2EA; padding:32px 16px; font-family: Georgia, 'Times New Roman', serif;">
    <div style="max-width:480px; margin:0 auto; background:#FFFFFF; border:1px solid #D8D3C4;">
      <div style="background:linear-gradient(135deg,#551314,#380D0D); padding:28px 32px; text-align:center;">
        <p style="color:#BA933C; text-transform:uppercase; letter-spacing:3px; font-size:11px; margin:0 0 6px;">Vinícola Arouca</p>
        <p style="color:#FFFFFF; font-size:20px; margin:0;">Casa Vinnus</p>
      </div>
      <div style="padding:32px;">
        <p style="text-transform:uppercase; letter-spacing:2px; font-size:11px; color:#BA933C; margin:0 0 6px;">Reserva confirmada</p>
        <h1 style="color:#551314; font-size:26px; font-weight:400; margin:0 0 24px;">Visita guiada com degustação</h1>

        <table style="width:100%; border-collapse:collapse; font-family: Arial, sans-serif; font-size:14px; color:#464244;">
          <tr><td style="padding:8px 0; border-bottom:1px solid #EEE;">Data</td><td style="padding:8px 0; border-bottom:1px solid #EEE; text-align:right;"><strong>${dataFormatada}</strong></td></tr>
          <tr><td style="padding:8px 0; border-bottom:1px solid #EEE;">Horário</td><td style="padding:8px 0; border-bottom:1px solid #EEE; text-align:right;"><strong>${horario}</strong></td></tr>
          <tr><td style="padding:8px 0; border-bottom:1px solid #EEE;">Nome</td><td style="padding:8px 0; border-bottom:1px solid #EEE; text-align:right;">${item.nome}</td></tr>
          <tr><td style="padding:8px 0; border-bottom:1px solid #EEE;">Pessoas</td><td style="padding:8px 0; border-bottom:1px solid #EEE; text-align:right;">${item.pessoas}</td></tr>
          <tr><td style="padding:8px 0; border-bottom:1px solid #EEE;">Degustação</td><td style="padding:8px 0; border-bottom:1px solid #EEE; text-align:right;">${item.tipoDegustacao === "vinho" ? "Vinho" : "Suco (sem álcool)"}</td></tr>
          <tr><td style="padding:8px 0;">Valor pago</td><td style="padding:8px 0; text-align:right;"><strong>R$ ${item.valorTotal}</strong></td></tr>
        </table>

        <div style="margin-top:28px; padding:16px 18px; background:#F5F2EA; border-radius:3px; font-family: Arial, sans-serif; font-size:13px; color:#5a5658;">
          Chegue com alguns minutos de antecedência. Endereço: Estr. Vila Dantas, km 5 — Vila Dantas, Areal – RJ, 25845-000.
        </div>

        <p style="font-family: Arial, sans-serif; font-size:12px; color:#8A8178; margin-top:24px;">Dúvidas? Fale conosco pelo WhatsApp: <a href="https://wa.me/5524998607810" style="color:#551314;">(24) 99860-7810</a></p>
      </div>
    </div>
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
      body: JSON.stringify({
        from: "Casa Vinnus <onboarding@resend.dev>",
        to: destinatarios,
        subject: assunto,
        html,
      }),
    });
  } catch (e) {
    console.error("Falha ao enviar e-mail:", e);
  }
}

async function notificarConfirmacao(item, chave, siteUrl) {
  const [data, horario] = chave.split("_");
  const dataFormatada = data.split("-").reverse().join("/");
  const voucherHtml = montarVoucherHtml(item, chave);

  // Voucher para o hóspede
  if (item.email) {
    await enviarEmail([item.email], "Sua visita à Casa Vinnus está confirmada", voucherHtml);
  }

  // Aviso interno — aceita um ou mais e-mails, separados por vírgula na variável EMAIL_EQUIPE
  const emailsEquipe = (process.env.EMAIL_EQUIPE || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (emailsEquipe.length > 0) {
    const linkPainel = siteUrl ? `${siteUrl}/admin-reservas.html` : "/admin-reservas.html";
    const htmlEquipe = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0;">
      <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #ddd;">
        <p style="text-transform: uppercase; letter-spacing: 2px; font-size: 11px; color: #BA933C;">Casa Vinnus — nova reserva</p>
        <h2 style="color: #551314; margin: 8px 0 20px;">${dataFormatada} às ${horario}</h2>
        <p><strong>Nome:</strong> ${item.nome}</p>
        <p><strong>WhatsApp:</strong> <a href="https://wa.me/55${item.telefone.replace(/\D/g, "")}" style="color:#551314;">${item.telefone}</a></p>
        <p><strong>E-mail:</strong> ${item.email ? `<a href="mailto:${item.email}" style="color:#551314;">${item.email}</a>` : "não informado"}</p>
        <p><strong>Pessoas:</strong> ${item.pessoas}</p>
        <p><strong>Degustação:</strong> ${item.tipoDegustacao === "vinho" ? "Vinho" : "Suco (sem álcool)"}</p>
        <p><strong>Valor pago:</strong> R$ ${item.valorTotal}${item.descontoAplicado ? " (com desconto de hóspede)" : ""}</p>
        ${item.teste ? '<p style="color:#8a6d1a;"><strong>Atenção: esta é uma reserva de TESTE.</strong></p>' : ""}
        <p style="margin-top: 24px; font-size: 12px; color: #888;">Ver todas as reservas no painel: <a href="${linkPainel}" style="color:#551314;">${linkPainel}</a></p>
      </div>
</body>
</html>`;
    await enviarEmail(emailsEquipe, `Nova reserva confirmada — ${dataFormatada} às ${horario}`, htmlEquipe);
  }
}

export default async (req) => {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response("Configuração ausente", { status: 500 });
  }

  const url = new URL(req.url);
  let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
  let topic = url.searchParams.get("type") || url.searchParams.get("topic");

  // O Mercado Pago também pode enviar a notificação via corpo POST em JSON.
  if (!paymentId && req.method === "POST") {
    try {
      const body = await req.json();
      paymentId = body?.data?.id;
      topic = body?.type || topic;
    } catch {
      // ignora corpo vazio/inválido
    }
  }

  // Só nos interessam notificações de pagamento.
  if (topic && topic !== "payment") {
    return new Response("ok", { status: 200 });
  }
  if (!paymentId) {
    return new Response("ok", { status: 200 });
  }

  // Busca os dados reais do pagamento direto na API do Mercado Pago —
  // nunca confiamos apenas no que a notificação diz, sempre confirmamos.
  let pagamento;
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      return new Response("ok", { status: 200 });
    }
    pagamento = await resp.json();
  } catch {
    return new Response("erro ao consultar pagamento", { status: 500 });
  }

  if (pagamento.status !== "approved") {
    // Pagamento ainda pendente, rejeitado, etc. Não faz nada — o hold expira sozinho se não for pago.
    return new Response("ok", { status: 200 });
  }

  const referencia = pagamento.external_reference || "";
  const [chave, holdId] = referencia.split("|");
  if (!chave || !holdId) {
    return new Response("ok", { status: 200 });
  }

  const store = getStore("reservas-casa-vinnus");

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let atual = { itens: [] };
    let etagAtual = null;

    try {
      const resultado = await store.getWithMetadata(chave, { type: "json" });
      if (resultado) {
        atual = resultado.data || atual;
        etagAtual = resultado.etag;
      }
    } catch {
      break; // nada para confirmar
    }

    const itens = atual.itens || [];
    const idx = itens.findIndex((item) => item.id === holdId);
    if (idx === -1) break;

    if (itens[idx].status === "confirmado") break; // já processado (webhook pode repetir)

    itens[idx] = { ...itens[idx], status: "confirmado", pagamentoId: paymentId, confirmadoEm: new Date().toISOString() };
    const novoRegistro = { itens };

    try {
      const opcoes = etagAtual ? { onlyIfMatch: etagAtual } : { onlyIfNew: true };
      const gravado = await store.setJSON(chave, novoRegistro, opcoes);
      if (gravado === false) continue;
      await notificarConfirmacao(itens[idx], chave, new URL(req.url).origin);
      break;
    } catch {
      continue;
    }
  }

  return new Response("ok", { status: 200 });
};

export const config = { path: "/api/webhook-mercadopago" };
