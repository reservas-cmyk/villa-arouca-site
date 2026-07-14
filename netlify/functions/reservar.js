import { getStore } from "@netlify/blobs";
import {
  HORARIOS_POR_DIA,
  CAPACIDADE_POR_TURMA,
  ANTECEDENCIA_MINIMA_HORAS,
  PRECOS,
  TIPOS_DEGUSTACAO,
} from "./_grade-horarios.js";
import { verificarCodigo } from "./_codigos.js";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: "Não consegui ler os dados enviados." }), { status: 400 });
  }

  const { data, horario, pessoas, nome, telefone, tipoDegustacao, codigoDesconto } = body || {};

  if (!data || !horario || !pessoas || !nome || !telefone) {
    return new Response(JSON.stringify({ erro: "Preencha todos os campos." }), { status: 400 });
  }

  const qtd = parseInt(pessoas, 10);
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > CAPACIDADE_POR_TURMA) {
    return new Response(JSON.stringify({ erro: "Número de pessoas inválido." }), { status: 400 });
  }

  const tipo = TIPOS_DEGUSTACAO.includes(tipoDegustacao) ? tipoDegustacao : "vinho";

  // Preço sempre calculado aqui, nunca confiando em valor vindo do navegador.
  const { valido: codigoValido } = await verificarCodigo(codigoDesconto);
  const tabela = PRECOS[tipo];
  const precoUnitario = codigoValido ? tabela.hospede : tabela.publico;
  const valorTotal = precoUnitario * qtd;

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

  function contarOcupadas(registro) {
    const agoraMs = Date.now();
    return (registro.itens || []).reduce((soma, item) => {
      if (item.status === "confirmado") return soma + item.pessoas;
      if (item.status === "pendente" && item.expiraEm > agoraMs) return soma + item.pessoas;
      return soma;
    }, 0);
  }

  // Até 4 tentativas para lidar com duas pessoas reservando ao mesmo tempo
  // (escrita condicional — só grava se ninguém alterou o registro entre a leitura e a escrita).
  // IMPORTANTE: a capacidade de 20 pessoas é compartilhada entre visita com vinho e com suco —
  // ambas contam para a mesma turma/horário, não são pools separados.
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
      // chave ainda não existe — segue com o valor padrão
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
          descontoAplicado: codigoValido,
          status: "confirmado",
          origem: "manual",
          criadoEm: new Date().toISOString(),
        },
      ],
    };

    try {
      const opcoes = etagAtual ? { onlyIfMatch: etagAtual } : { onlyIfNew: true };
      const gravado = await store.setJSON(chave, novoRegistro, opcoes);
      if (gravado === false) {
        // alguém escreveu entre a leitura e a escrita — tenta de novo
        continue;
      }
      return new Response(
        JSON.stringify({
          ok: true,
          vagasRestantes: CAPACIDADE_POR_TURMA - contarOcupadas(novoRegistro),
          valorTotal,
          precoUnitario,
          descontoAplicado: codigoValido,
          mensagem: "Reserva registrada. A equipe entrará em contato para confirmar o pagamento.",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch {
      continue;
    }
  }

  return new Response(
    JSON.stringify({ erro: "Muitas pessoas reservando ao mesmo tempo — tente novamente em alguns segundos." }),
    { status: 500 }
  );
};

export const config = { path: "/api/reservar" };
