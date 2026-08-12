export function converterUpdatedAt(updatedAt) {
  if (typeof updatedAt !== "string" || updatedAt.trim() === "") {
    throw new Error('A resposta da API nao contem "updatedAt" valido.');
  }
  const data = new Date(updatedAt);
  if (Number.isNaN(data.getTime())) throw new Error(`updatedAt invalido: ${updatedAt}`);
  return data;
}

export function calcularDiasDesdeAtualizacao(dataDaAtualizacao, agora = new Date()) {
  const diferencaEmMs = agora.getTime() - dataDaAtualizacao.getTime();
  if (diferencaEmMs < 0) throw new Error("A data de atualizacao esta no futuro.");
  return diferencaEmMs / (1000 * 60 * 60 * 24);
}
