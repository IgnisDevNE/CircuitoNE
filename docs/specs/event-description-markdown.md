# Markdown da descrição de eventos

Estado: implementado pela [PR #82](https://github.com/IgnisDevNE/CircuitoNE/pull/82) em 23/09/2026. CI de `main` e [promoção da suíte QA](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35923261808) passaram. A [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) ainda exige o isolamento final de credenciais da esteira; conectar conteúdo real depende da identidade e autorização previstas em F1/F3.

O editor oferece título, subtítulo, negrito, itálico, lista simples e link. A página pública renderiza somente parágrafos, esses formatos e quebras de linha. Links externos precisam de URL absoluta HTTP ou HTTPS e abrem em nova aba com `noopener noreferrer`. URLs malformadas ou com outros protocolos aparecem sem link. Imagens Markdown e HTML bruto não são renderizados. Uma futura prévia deve usar o mesmo componente da página pública.

O conteúdo é processado como nós React por `react-markdown`, sem gerar HTML por substituição de strings ou usar `dangerouslySetInnerHTML`. A política é a mesma na renderização do servidor e do navegador. Regressões cobrem aspas e atributos de evento no destino de link, HTML com `onerror`, `javascript:`, URL incompleta, imagens remotas e parênteses em URL válida; a jornada Playwright cobre o cadastro mockado até a página pública.

Tradeoff: o parser mantido aumenta o bundle, mas evita manter um parser próprio de Markdown e preserva links válidos com parênteses. O editor continua sendo texto simples, sem prévia renderizada, upload ou incorporação de mídia nessa descrição.
