import { getStore } from "@netlify/blobs";
import { CODIGO_DESCONTO_HOSPEDE, CODIGO_TESTE_R1 } from "./_grade-horarios.js";

// Verifica um código digitado pelo hóspede.
// Retorna { valido: boolean, teste: boolean } — nunca lança erro, sempre resolve.
export async function verificarCodigo(codigoInformado) {
  const codigo = (codigoInformado || "").trim().toUpperCase();
  if (!codigo) return { valido: false, teste: false };

  if (codigo === CODIGO_TESTE_R1) {
    return { valido: true, teste: true };
  }

  // Código antigo fixo, mantido por compatibilidade.
  if (codigo === CODIGO_DESCONTO_HOSPEDE) {
    return { valido: true, teste: false };
  }

  // Códigos criados pela equipe no painel.
  try {
    const store = getStore("codigos-desconto");
    const dados = await store.get(codigo, { type: "json" });
    if (dados && dados.ativo) {
      return { valido: true, teste: false };
    }
  } catch {
    // se der erro consultando, trata como código inválido — não quebra a reserva
  }

  return { valido: false, teste: false };
}
