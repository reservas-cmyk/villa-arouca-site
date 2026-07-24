import { getStore } from "@netlify/blobs";

function autenticado(req) {
  const senhaEsperada = process.env.ADMIN_SECRET;
  const senhaEnviada = req.headers.get("x-admin-secret");
  return senhaEsperada && senhaEnviada === senhaEsperada;
}

export default async (req) => {
  if (!autenticado(req)) {
    return new Response(JSON.stringify({ erro: "Senha incorreta." }), { status: 401 });
  }

  const store = getStore("codigos-desconto");

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const codigos = [];
    for (const b of blobs) {
      const dados = await store.get(b.key, { type: "json" });
      if (dados) codigos.push({ codigo: b.key, ...dados });
    }
    return new Response(JSON.stringify({ codigos }), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ erro: "Dados inválidos." }), { status: 400 });
    }
    const codigo = (body.codigo || "").trim().toUpperCase();
    if (!codigo || !/^[A-Z0-9]{4,20}$/.test(codigo)) {
      return new Response(JSON.stringify({ erro: "Código deve ter de 4 a 20 letras/números, sem espaços." }), { status: 400 });
    }
    await store.setJSON(codigo, {
      tipo: "hospede", // por enquanto só existe esse tipo — aplica o preço de hóspede
      ativo: true,
      criadoEm: new Date().toISOString(),
      criadoPor: body.criadoPor || "equipe",
    });
    return new Response(JSON.stringify({ ok: true, codigo }), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const codigo = (url.searchParams.get("codigo") || "").trim().toUpperCase();
    if (!codigo) {
      return new Response(JSON.stringify({ erro: "Informe o código." }), { status: 400 });
    }
    await store.delete(codigo);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ erro: "Método não permitido." }), { status: 405 });
};

export const config = { path: "/api/codigos" };
