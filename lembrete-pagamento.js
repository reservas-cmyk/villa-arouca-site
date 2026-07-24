import { getStore } from "@netlify/blobs";
import { HORARIOS_POR_DIA, CAPACIDADE_POR_TURMA, PRECOS, TIPOS_DEGUSTACAO } from "./_grade-horarios.js";

function autenticado(req) {
  const senhaEsperada = process.env.ADMIN_SECRET;
  const senhaEnviada = req.headers.get("x-admin-secret");
  return senhaEsperada && senhaEnviada === senhaEsperada;
}

function contarOcupadas(registro) {
  const agoraMs = Date.now();
  return (registro.itens || []).reduce((soma, item) => {
    if (item.status === "confirmado" || item.status === "pendente_manual") return soma + item.pessoas;
    if (item.status === "pendente" && item.expiraEm > agoraMs) return soma + item.pessoas;
    return soma;
  }, 0);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido." }), { status: 405 });
  }
  if (!autenticado(req)) {
    return new Response(JSON.stringify({ erro: "Senha incorreta." }), { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: "Dados inválidos." }), { status: 400 });
  }

  const { data, horario, pessoas, nome, telefone, tipoDegustacao, paga } = body || {};

  if (!data || !horario || !pessoas || !nome || !telefone) {
    return new Response(JSON.stringify({ erro: "Preencha todos os campos." }), { status: 400 });
  }
  const qtd = parseInt(pessoas, 10);
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > CAPACIDADE_POR_TURMA) {
    return new Response(JSON.stringify({ erro: "Número de pessoas inválido." }), { status: 400 });
  }

  const diaSemana = new Date(data + "T12:00:00").getDay();
  const horariosValidos = HORARIOS_POR_DIA[diaSemana] || [];
  if (!horariosValidos.includes(horario)) {
    return new Response(JSON.stringify({ erro: "Esse horário não existe para a data escolhida." }), { status: 400 });
  }

  const tipo = TIPOS_DEGUSTACAO.includes(tipoDegustacao) ? tipoDegustacao : "vinho";
  const precoUnitario = PRECOS[tipo].publico; // reserva manual usa preço público por padrão — ajustável depois no painel se preciso
  const valorTotal = precoUnitario * qtd;

  const store = getStore("reservas-casa-vinnus");
  const chave = `${data}_${horario}`;

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
      // chave nova
    }

    const ocupadas = contarOcupadas(atual);
    if (ocupadas + qtd > CAPACIDADE_POR_TURMA) {
      return new Response(
        JSON.stringify({ erro: `Só restam ${Math.max(0, CAPACIDADE_POR_TURMA - ocupadas)} vaga(s) nesse horário.` }),
        { status: 409 }
      );
    }

    const novoRegistro = {
      itens: [
        ...(atual.itens || []),
        {
          id: crypto.randomUUID(),
          nome,
          telefone,
          pessoas: qtd,
          tipoDegustacao: tipo,
          precoUnitario,
          valorTotal,
          descontoAplicado: false,
          status: paga ? "confirmado" : "pendente_manual",
          origem: "whatsapp",
          criadoEm: new Date().toISOString(),
        },
      ],
    };

    try {
      const opcoes = etagAtual ? { onlyIfMatch: etagAtual } : { onlyIfNew: true };
      const gravado = await store.setJSON(chave, novoRegistro, opcoes);
      if (gravado === false) continue;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ erro: "Não foi possível salvar, tente de novo." }), { status: 500 });
};

export const config = { path: "/api/criar-reserva-manual" };
