export function resolverData(expr, base) {
  const original = expr;

  
  const normalizada = expr.trim().toLowerCase();


  const partes = base.split("-").map(Number);
  const data = new Date(partes[0], partes[1] - 1, partes[2]);

 
  function formatarData(d) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
  }

  
  function adicionarDias(d, quantidade) {
    const resultado = new Date(d);
    resultado.setDate(resultado.getDate() + quantidade);
    return resultado;
  }


  let match = normalizada.match(/^([+-])(\d+)\s+dias$/);

  if (match) {
    const sinal = match[1] === "+" ? 1 : -1;
    const quantidade = Number(match[2]);

    return formatarData(
      adicionarDias(data, sinal * quantidade)
    );
  }


  match = normalizada.match(/^([+-])(\d+)\s+semanas$/);

  if (match) {
    const sinal = match[1] === "+" ? 1 : -1;
    const quantidade = Number(match[2]);

    return formatarData(
      adicionarDias(data, sinal * quantidade * 7)
    );
  }


  match = normalizada.match(/^([+-])(\d+)\s+dias\s+uteis$/);

  if (match) {
    const sinal = match[1] === "+" ? 1 : -1;
    let restantes = Number(match[2]);
    const resultado = new Date(data);

    while (restantes > 0) {
      resultado.setDate(resultado.getDate() + sinal);

      const diaSemana = resultado.getDay();

      // 0 = domingo, 6 = sábado
      if (diaSemana !== 0 && diaSemana !== 6) {
        restantes--;
      }
    }

    return formatarData(resultado);
  }

  
  match = normalizada.match(
    /^proxima\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)$/
  );

  if (match) {
    const diasSemana = {
      domingo: 0,
      segunda: 1,
      terca: 2,
      quarta: 3,
      quinta: 4,
      sexta: 5,
      sabado: 6
    };

    const diaDesejado = diasSemana[match[1]];
    const diaAtual = data.getDay();

   
    let diferenca = (diaDesejado - diaAtual + 7) % 7;

    if (diferenca === 0) {
      diferenca = 7;
    }

    return formatarData(
      adicionarDias(data, diferenca)
    );
  }

 
  if (normalizada === "ultimo dia do mes") {
    const resultado = new Date(
      data.getFullYear(),
      data.getMonth() + 1,
      0
    );

    return formatarData(resultado);
  }

 
  throw new Error(`expressao de data invalida: "${original}"`);
}