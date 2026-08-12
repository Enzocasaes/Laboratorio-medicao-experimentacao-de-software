export function separarOwnerENome(nameWithOwner) {
  const separador = typeof nameWithOwner === "string" ? nameWithOwner.indexOf("/") : -1;
  if (separador <= 0 || separador === nameWithOwner.length - 1) {
    throw new Error(`Identificador de repositorio invalido: ${nameWithOwner}`);
  }
  return { owner: nameWithOwner.slice(0, separador), name: nameWithOwner.slice(separador + 1) };
}
