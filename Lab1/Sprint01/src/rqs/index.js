/**
 * Registro central das RQs. O runner (src/minerar.js) usa este mapa para
 * descobrir quais RQs existem e executa-las por chave ("rq01".."rq07").
 *
 * Para adicionar uma nova RQ: crie src/rqs/rqNN.js (com extrair/resumir para
 * metrica por repositorio, ou analisar para metrica agregada) e registre-a
 * aqui. Nenhum outro arquivo precisa mudar.
 */
import { RQ01 } from "./rq01.js";
import { RQ02 } from "./rq02.js";
import { RQ03 } from "./rq03.js";
import { RQ04 } from "./rq04.js";
import { RQ05 } from "./rq05.js";
import { RQ06 } from "./rq06.js";
import { RQ07 } from "./rq07.js";

export const RQS = {
  rq01: RQ01,
  rq02: RQ02,
  rq03: RQ03,
  rq04: RQ04,
  rq05: RQ05,
  rq06: RQ06,
  rq07: RQ07,
};
