// Configuração central da grade de horários da visita guiada Casa Vinnus.
// Mude os valores aqui se a grade mudar — as duas funções (disponibilidade e reservar) leem deste arquivo.

// Chave: dia da semana no padrão JS Date.getDay() -> 0=domingo, 1=segunda, ..., 6=sábado
export const HORARIOS_POR_DIA = {
  4: ["14:00"],           // quinta-feira
  5: ["11:00", "14:00"],  // sexta-feira
  6: ["11:00", "14:00"],  // sábado
  0: ["11:00"],           // domingo
};

export const CAPACIDADE_POR_TURMA = 20;
export const ANTECEDENCIA_MINIMA_HORAS = 18;
export const DURACAO_MINUTOS = 90;

// Preços — a capacidade (20 pessoas) é compartilhada entre os dois tipos de degustação.
export const PRECOS = {
  vinho: { publico: 180, hospede: 160 },
  suco: { publico: 120, hospede: 105 },
};

// Código de desconto para hóspedes da Villa Arouca — troque aqui se quiser outro código.
export const CODIGO_DESCONTO_HOSPEDE = "HOSPEDEVA";

// Código só para TESTE do pagamento — força o total da reserva para R$ 1,00, não importa quantas pessoas.
// Remova ou troque essa linha quando terminar os testes, para ninguém mais conseguir usar.
export const CODIGO_TESTE_R1 = "TESTEVA1";

export const TIPOS_DEGUSTACAO = ["vinho", "suco"];
