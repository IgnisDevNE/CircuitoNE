import type { ArtistaEstilo } from '../data/types'

/** Rótulo exibido de um par estilo/subestilo: o subestilo quando existe, senão o estilo. */
export const estiloLabel = (item: ArtistaEstilo) => item.subestilo ?? item.estilo

/** Rótulos exibidos de um artista, sem repetição e na ordem recebida. */
export const estiloLabels = (estilos: ArtistaEstilo[]) => [...new Set(estilos.map(estiloLabel))]
