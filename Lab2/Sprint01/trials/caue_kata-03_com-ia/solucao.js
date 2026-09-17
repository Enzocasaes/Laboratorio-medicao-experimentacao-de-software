export function calcularTarifa(entrada, saida, tabela) {
  // 1. Validação dos campos da tabela
  const camposObrigatorios = ['toleranciaMin', 'tarifaMinima', 'tarifaPorHora', 'tetoDiario'];
  if (!tabela || typeof tabela !== 'object') {
    throw new Error('Tabela de tarifas inválida.');
  }

  for (const campo of camposObrigatorios) {
    const valor = tabela[campo];
    if (typeof valor !== 'number' || Number.isNaN(valor) || valor < 0) {
      throw new Error(`O campo "${campo}" deve ser um número não negativo.`);
    }
  }

  // 2. Validação e conversão dos horários HH:MM
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeRegex.test(entrada) || !timeRegex.test(saida)) {
    throw new Error('Os horários de entrada e saída devem estar no formato HH:MM (24h).');
  }

  const [hEntrada, mEntrada] = entrada.split(':').map(Number);
  const [hSaida, mSaida] = saida.split(':').map(Number);

  const minutosEntrada = hEntrada * 60 + mEntrada;
  const minutosSaida = hSaida * 60 + mSaida;

  if (minutosSaida <= minutosEntrada) {
    throw new Error('O horário de saída deve ser estritamente posterior ao de entrada.');
  }

  const minutosTotais = minutosSaida - minutosEntrada;

  // 3. Aplicação das regras de negócio
  // Regra 3: Tolerância (gratuito)
  if (minutosTotais <= tabela.toleranciaMin) {
    return 0;
  }

  // Regra 4: Até 60 minutos
  if (minutosTotais <= 60) {
    return Number(Math.min(tabela.tarifaMinima, tabela.tetoDiario).toFixed(2));
  }

  // Regra 5: Acima de 60 minutos (hora iniciada adicional)
  const minutosExcedentes = minutosTotais - 60;
  const horasAdicionais = Math.ceil(minutosExcedentes / 60);
  const valorTotal = tabela.tarifaMinima + horasAdicionais * tabela.tarifaPorHora;

  // Regras 6 e 7: Teto diário e arredondamento em 2 casas
  const valorFinal = Math.min(valorTotal, tabela.tetoDiario);
  return Number(valorFinal.toFixed(2));
}