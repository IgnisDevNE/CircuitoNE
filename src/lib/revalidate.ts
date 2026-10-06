import type { ShouldRevalidateFunction } from 'react-router'

/**
 * Depois de qualquer envio de formulário os loaders são recarregados, também quando a ação responde com erro (4xx/5xx).
 * Por padrão o React Router pula a revalidação nesse caso, e uma recusa do banco ("pedido já existe", "já decidido")
 * indica justamente que a lista na tela ficou desatualizada.
 */
export const revalidateAfterSubmit: ShouldRevalidateFunction = ({ formMethod, defaultShouldRevalidate }) =>
  formMethod ? true : defaultShouldRevalidate
