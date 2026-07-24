import { getStore } from "@netlify/blobs";
import { HORARIOS_POR_DIA, CAPACIDADE_POR_TURMA, ANTECEDENCIA_MINIMA_HORAS, PRECOS } from "./_grade-horarios.js";

export default async (req) => {
  const url = new URL(req.url);
  const data = url.searchParams.get("data"); // formato YYYY-MM-DD

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new Response(JSON.stringify({ erro: "Informe uma data no formato YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const diaSemana = new Date(data + "T12:00:00").getDay();
  const horariosDoDia = HORARIOS_POR_DIA[diaSemana] || [];

  if (horariosDoDia.length === 0) {
    return new Response(JSON.stringify({ data, horarios: [], mensagem: "Não recebemos visitas às segundas, terças e quartas. Escolha quinta, sexta, sábado ou domingo." }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = getStore("reservas-casa-vinnus");
  const agora = new Date();
  const agoraMs = Date.now();

  const horarios = [];
  for (const horario of horariosDoDia) {
    const chave = `${data}_${horario}`;
    let registro;
    try {
      registro = await store.get(chave, { type: "json" });
    } catch {
      registro = null;
    }
    const itens = registro?.itens || [];
    const ocupadas = itens.reduce((soma, item) => {
      if (item.status === "confirmado" || item.status === "pendente_manual") return soma + item.pessoas;
      if (item.status === "pendente" && item.expiraEm > agoraMs) return soma + item.pessoas;
      return soma;
    }, 0);

    const dataHorario = new Date(`${data}T${horario}:00`);
    const horasAteVisita = (dataHorario - agora) / 3600000;
    const dentroDoPrazo = horasAteVisita >= ANTECEDENCIA_MINIMA_HORAS;

    horarios.push({
      horario,
      vagasRestantes: Math.max(0, CAPACIDADE_POR_TURMA - ocupadas),
      disponivel: dentroDoPrazo && (CAPACIDADE_POR_TURMA - ocupadas) > 0,
    });
  }

  return new Response(JSON.stringify({ data, horarios, precos: PRECOS }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/api/disponibilidade" };
