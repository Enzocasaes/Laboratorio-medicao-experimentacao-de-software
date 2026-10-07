// Log minimo com horario e nivel. Nunca recebe o token: o cliente HTTP so'
// registra caminhos de URL e status.

const NIVEIS = { debug: 10, info: 20, aviso: 30, erro: 40 };

export function criarLog({ nivel = process.env.LOG_LEVEL ?? "info", saida = console } = {}) {
  const minimo = NIVEIS[nivel] ?? NIVEIS.info;
  const emitir = (nome, metodo) => (mensagem) => {
    if (NIVEIS[nome] < minimo) return;
    saida[metodo](`[${new Date().toISOString()}] ${nome.toUpperCase().padEnd(5)} ${mensagem}`);
  };
  return {
    debug: emitir("debug", "log"),
    info: emitir("info", "log"),
    aviso: emitir("aviso", "warn"),
    erro: emitir("erro", "error"),
  };
}

const nada = () => {};
export const logSilencioso = { debug: nada, info: nada, aviso: nada, erro: nada };
