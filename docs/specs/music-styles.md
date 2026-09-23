# Estilos musicais — taxonomia condensada

**Estado:** catálogo aprovado pelo responsável em 23/09/2026 para cadastro e filtro do MVP; interface e persistência ainda não implementadas.

Fonte: https://everynoise.com/engenremap.html

Consulta: 22/09/2026. Foram extraídos 6.291 rótulos do mapa.

O arquivo [estilos-musicais.json](estilos-musicais.json) contém 51 estilos ou famílias principais e 179 estilos secundários. Vinte categorias principais não têm subdivisões. Ele é a referência normativa desta taxonomia no MVP; não manter uma segunda lista editável no código ou em testes.

## Formato

Cada chave é uma categoria principal. Seu valor é a lista de estilos secundários. Uma lista vazia significa que a categoria pode ser usada diretamente, sem selecionar um subestilo. Não existe terceiro nível.

No cadastro/edição da atuação artística, apresentar dois seletores vinculados: **estilo** obrigatório e **subestilo** opcional, limitado aos itens do estilo escolhido. Um artista pode adicionar mais de um par estilo/subestilo, sem duplicatas. Ao trocar o estilo, limpar subestilo incompatível. O filtro usa a taxonomia aprovada: selecionar estilo inclui seus subestilos; selecionar subestilo restringe ao par escolhido. Uma categoria sem subestilos mostra apenas o primeiro seletor. Validar os valores contra o catálogo no servidor, não apenas na interface.

## Critérios

- Classificação editorial para navegação e cadastro, não uma hierarquia oficial do Every Noise nem uma afirmação de genealogia musical.
- Removidos recortes de país, cidade, idioma, época, público e popularidade quando não definem uma distinção musical necessária.
- Preservados nomes consolidados que carregam uma referência geográfica, como uk garage, goa trance, italo disco e jersey club. Não basta apagar palavras de lugar mecanicamente.
- Variantes que exigiriam um terceiro nível foram reduzidas ao subestilo de segundo nível. Quando não há subestilo apropriado, usa-se a categoria principal.
- Os termos ingleses de uso corrente foram mantidos; algumas famílias agregadoras e nomes brasileiros usam português.
- Categorias híbridas receberam uma única posição, por praticidade. Por exemplo, psytrance está em trance, breakcore em hardcore eletrônico e grime em hip hop.
- Música não eletrônica foi bastante condensada. Música brasileira e música latina preservam algumas distinções; tradições regionais restantes ficam em músicas tradicionais e regionais.
- Religião, público infantil, trilhas e áudio não musical são categorias funcionais presentes na fonte, mantidas para acomodar esse conteúdo.
- Esta proposta contém uma lista condensada. Não há correspondência individual auditada para cada um dos 6.291 rótulos originais.

## Exemplos de redução

| Rótulo original | Categoria principal | Estilo secundário |
|---|---|---|
| berlin minimal techno | techno | minimal techno |
| hard industrial techno | techno | industrial techno |
| hard minimal techno | techno | minimal techno |
| german dark minimal techno | techno | minimal techno |
| minimal melodic techno | techno | melodic techno |
| german techno | techno | — |
| deep deep tech house | house | tech house |
| south african soulful deep house | house | soulful house |
| dark psytrance | trance | psytrance |
| progressive psytrance | trance | psytrance |
| liquid funk | drum and bass | liquid drum and bass |
| intelligent dance music | electronica | idm |
| phonk brasileiro | phonk | brazilian phonk |
| japanese psychedelic rock | rock | — |
| melodic metalcore | metal | — |
| hardcore punk | punk | — |
| sertanejo universitario | música brasileira | sertanejo |
| samba de roda | música brasileira | samba |

Em rótulos híbridos, o critério editorial escolhe a característica mais útil para navegação: industrial prevalece sobre hard no exemplo pedido; minimal prevalece sobre hard e dark nos exemplos de minimal techno. Essas escolhas não são regras universais de musicologia.

Validação: JSON válido, somente dois níveis de classificação, sem subestilos duplicados e com os exemplos solicitados preservados.
