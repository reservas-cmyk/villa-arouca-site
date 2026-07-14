import { getStore } from "@netlify/blobs";

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
      break;
    } catch {
      continue;
    }
  }

  return new Response("ok", { status: 200 });
};

export const config = { path: "/api/webhook-mercadopago" };
