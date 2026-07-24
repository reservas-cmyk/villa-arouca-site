import { getStore } from "@netlify/blobs";
import { HORARIOS_POR_DIA, CAPACIDADE_POR_TURMA } from "./_grade-horarios.js";

export default async (req) => {
  const senhaEsperada = process.env.ADMIN_SECRET;
  if (!senhaEsperada) {
    return new Response(JSON.stringify({ erro: "Painel ainda não configurado (falta ADMIN_SECRET)." }), { status: 500 });
  }

  const senhaEnviada = req.headers.get("x-admin-secret");
  if (senhaEnviada !== senhaEsperada) {
    return new Response(JSON.stringify({ erro: "Senha incorreta." }), { status: 401 });
  }

  const url = new URL(req.url);
  const dataInicio = url.searchParams.get("inicio");
  const dataFim = url.searchParams.get("fim");

  if (!dataInicio || !dataFim) {
    return new Response(JSON.stringify({ erro: "Informe início e fim." }), { status: 400 });
  }

  const store = getStore("reservas-casa-vinnus");
  const agoraMs = Date.now();
  const resultado = [];

  // Percorre cada dia do intervalo e cada horário possível daquele dia da semana.
  let cursor = new Date(dataInicio + "T12:00:00");
  const fim = new Date(dataFim + "T12:00:00");

  while (cursor <= fim) {
    const dataStr = cursor.toISOString().split("T")[0];
    const diaSemana = cursor.getDay();
    const horariosDoDia = HORARIOS_POR_DIA[diaSemana] || [];

    for (const horario of horariosDoDia) {
      const chave = `${dataStr}_${horario}`;
      let registro;
      try {
        registro = await store.get(chave, { type: "json" });
      } catch {
        registro = null;
      }
      const itens = (registro?.itens || []).filter((item) => {
        if (item.status === "confirmado" || item.status === "pendente_manual") return true;
        if (item.status === "pendente" && item.expiraEm > agoraMs) return true;
        return false;
      });

      const ocupadas = itens.reduce((s, i) => s + i.pessoas, 0);

      if (itens.length > 0) {
        resultado.push({
          data: dataStr,
          horario,
          vagasRestantes: Math.max(0, CAPACIDADE_POR_TURMA - ocupadas),
          reservas: itens,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return new Response(JSON.stringify({ turmas: resultado }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/api/listar-reservas" };
