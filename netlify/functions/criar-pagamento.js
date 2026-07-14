import { getStore } from "@netlify/blobs";
import {
  HORARIOS_POR_DIA,
  CAPACIDADE_POR_TURMA,
  ANTECEDENCIA_MINIMA_HORAS,
  PRECOS,
  TIPOS_DEGUSTACAO,
} from "./_grade-horarios.js";
import { verificarCodigo } from "./_codigos.js";

const DURACAO_HOLD_MINUTOS = 15;

// Soma pessoas de itens confirmados + pendentes ainda não expirados.
function contarOcupadas(registro) {
  const agora = Date.now();
  return (registro.itens || []).reduce((soma, item) => {
    if (item.status === "confirmado") return soma + item.pessoas;
    if (item.status === "pendente" && item.expiraEm > agora) return soma + item.pessoas;
    return soma;
  }, 0);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), { status: 405 });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(JSON.stringify({ erro: "Pagamento ainda não configurado. Fale pelo WhatsApp." }), { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: "Não consegui ler os dados enviados." }), { status: 400 });
  }

  const { data, horario, pessoas, nome, telefone, email, tipoDegustacao, codigoDesconto } = body || {};

  if (!data || !horario || !pessoas || !nome || !telefone || !email) {
    return new Response(JSON.stringify({ erro: "Preencha todos os campos." }), { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ erro: "E-mail inválido." }), { status: 400 });
  }

  const qtd = parseInt(pessoas, 10);
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > CAPACIDADE_POR_TURMA) {
    return new Response(JSON.stringify({ erro: "Número de pessoas inválido." }), { status: 400 });
  }

  const tipo = TIPOS_DEGUSTACAO.includes(tipoDegustacao) ? tipoDegustacao : "vinho";
  const { valido: codigoValido, teste: codigoTeste } = await verificarCodigo(codigoDesconto);
  const tabela = PRECOS[tipo];
  const precoUnitario = codigoValido ? tabela.hospede : tabela.publico;
  const valorTotal = codigoTeste ? 1 : precoUnitario * qtd;

  const diaSemana = new Date(data + "T12:00:00").getDay();
  const horariosValidos = HORARIOS_POR_DIA[diaSemana] || [];
  if (!horariosValidos.includes(horario)) {
    return new Response(JSON.stringify({ erro: "Esse horário não existe para a data escolhida." }), { status: 400 });
  }

  const dataHorario = new Date(`${data}T${horario}:00`);
  const horasAteVisita = (dataHorario - new Date()) / 3600000;
  if (horasAteVisita < ANTECEDENCIA_MINIMA_HORAS) {
    return new Response(
      JSON.stringify({ erro: `É preciso agendar com pelo menos ${ANTECEDENCIA_MINIMA_HORAS}h de antecedência.` }),
      { status: 400 }
    );
  }

  const store = getStore("reservas-casa-vinnus");
  const chave = `${data}_${horario}`;
  const holdId = crypto.randomUUID();

  let novoRegistro = null;

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
      // chave ainda não existe
    }

    const ocupadas = contarOcupadas(atual);
    if (ocupadas + qtd > CAPACIDADE_POR_TURMA) {
      return new Response(
        JSON.stringify({ erro: `Só restam ${Math.max(0, CAPACIDADE_POR_TURMA - ocupadas)} vaga(s) nesse horário.` }),
        { status: 409 }
      );
    }

    novoRegistro = {
      itens: [
        ...(atual.itens || []),
        {
          id: holdId,
          nome,
          telefone,
          email,
          pessoas: qtd,
          tipoDegustacao: tipo,
          precoUnitario,
          valorTotal,
          descontoAplicado: codigoValido,
          teste: codigoTeste,
          status: "pendente",
          criadoEm: new Date().toISOString(),
          expiraEm: Date.now() + DURACAO_HOLD_MINUTOS * 60000,
          lembreteEnviado: false,
        },
      ],
    };

    try {
      const opcoes = etagAtual ? { onlyIfMatch: etagAtual } : { onlyIfNew: true };
      const gravado = await store.setJSON(chave, novoRegistro, opcoes);
      if (gravado === false) continue;
      break;
    } catch {
      continue;
    }
  }

  if (!novoRegistro) {
    return new Response(
      JSON.stringify({ erro: "Muitas pessoas reservando ao mesmo tempo — tente novamente em alguns segundos." }),
      { status: 500 }
    );
  }

  // Cria a preferência de pagamento no Mercado Pago
  const siteUrl = new URL(req.url).origin;
  const tituloItem = (codigoTeste ? "[TESTE] " : "") + `Visita guiada Casa Vinnus — ${tipo === "vinho" ? "degustação de vinho" : "degustação de suco"} (${qtd} pessoa${qtd > 1 ? "s" : ""})`;

  try {
    const respostaMP = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            title: tituloItem,
            quantity: 1,
            unit_price: valorTotal,
            currency_id: "BRL",
          },
        ],
        payer: { name: nome, email: email },
        external_reference: `${chave}|${holdId}`,
        back_urls: {
          success: `${siteUrl}/agendar-visita.html?status=sucesso`,
          pending: `${siteUrl}/agendar-visita.html?status=pendente`,
          failure: `${siteUrl}/agendar-visita.html?status=falha`,
        },
        auto_return: "approved",
        notification_url: `${siteUrl}/api/webhook-mercadopago`,
        metadata: { chave, holdId },
      }),
    });

    if (!respostaMP.ok) {
      const detalhes = await respostaMP.text();
      console.error("Erro Mercado Pago:", detalhes);
      return new Response(JSON.stringify({ erro: "Não foi possível gerar o link de pagamento. Tente novamente ou fale pelo WhatsApp." }), { status: 502 });
    }

    const preferencia = await respostaMP.json();

    return new Response(
      JSON.stringify({
        ok: true,
        checkoutUrl: preferencia.init_point,
        valorTotal,
        precoUnitario,
        descontoAplicado: codigoValido,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erro ao criar pagamento:", e);
    return new Response(JSON.stringify({ erro: "Não foi possível gerar o link de pagamento agora. Tente novamente ou fale pelo WhatsApp." }), { status: 500 });
  }
};

export const config = { path: "/api/criar-pagamento" };
