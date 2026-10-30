# tiago7 Plain Text Export Plugin Obsidian v1.6.6

> v1.6.6: o batch reutiliza com segurança o mapa determinístico de destinos enquanto o vault relevante permanece estável, preservando as proteções de identidade e evitando a regressão de performance da v1.6.5.


## v1.6.4 — identidade segura da seleção em lote

- Corrige o HOLD M-01 da v1.6.3 sem alterar a engine de limpeza/exportação herdada da v1.5.1.
- A seleção direta no File Explorer agora guarda referências aos `TFile` selecionados, e não apenas strings de path.
- Rename/move mantém a mesma nota selecionada porque a identidade do objeto é preservada e o path atual é usado pelo próprio `TFile`.
- Delete remove a nota da seleção e atualiza contagem/feedback, sem deixar um path antigo apontar para outra nota.
- Antes de confirmar o lote, cada `TFile` é validado por identidade (`vault.getAbstractFileByPath(file.path) === file`). Se alguma entrada estiver inválida, a exportação não começa; a seleção é atualizada e o usuário precisa confirmar novamente.
- A correção também cobre o caso adversarial em que outra nota passa a ocupar o path antigo de uma nota movida/excluída.
- Nenhuma mudança intencional em limpeza Markdown, embeds, cálculo determinístico dos destinos, escrita dos `.txt`, configurações, UI visual ou formato de dados persistidos.

## Expansão de notas incorporadas

A exportação pode substituir incorporações do Obsidian pelo conteúdo real das notas:

```markdown
![[Nome da nota]]
![[Nome da nota#Cabeçalho]]
![[Nome da nota#^identificador-do-bloco]]
![[Nome da nota|Alias]]
```

- Notas inteiras são incluídas por completo, sem o frontmatter da nota incorporada.
- Incorporações de cabeçalho incluem somente o conteúdo abaixo do cabeçalho, até o próximo cabeçalho do mesmo nível ou de nível superior.
- Blocos identificados são incluídos quando o cache do Obsidian consegue resolvê-los; existe também uma resolução alternativa simples.
- Incorporações dentro de outras notas incorporadas são expandidas recursivamente.
- Ciclos são interrompidos com uma indicação como `[Incorporação circular ignorada: Nome]`.
- Imagens, PDFs, áudios e outros anexos viram uma indicação textual e nunca são lidos como Markdown.
- A resolução usa `MetadataCache.getFirstLinkpathDest`, considerando a nota de origem de cada incorporação.
- Todo título Markdown dentro de uma nota incorporada é rebaixado um nível durante a exportação: `#` vira `##`, `##` vira `###` e assim por diante.
- Em incorporações encadeadas, cada nível acrescenta mais um `#`, preservando a hierarquia entre a nota principal e as notas incorporadas.
- Títulos que aparecem dentro de blocos de código cercados por crases ou tils não são alterados.

A alteração acontece apenas na memória durante a exportação. Nenhuma nota original é modificada.

## Novas configurações

- **Expandir notas incorporadas na exportação** — ativada por padrão.
- **Indicar incorporações não encontradas** — ativada por padrão. Quando desativada, incorporações inválidas são removidas silenciosamente.

## Limpeza de marcações

Além das regras anteriores, esta versão reconhece e remove, preservando o texto interno:

```text
{h1{Texto}}
{f2{Texto}}
{u{Texto}}
{1{Texto}}
```

A exportação continua preservando títulos, listas, caixas de tarefa e tabelas conforme as configurações existentes.

## Exportação múltipla e interface

Continuam disponíveis:

- exportação da nota atual;
- cópia da nota atual como texto limpo;
- exportação de várias notas;
- pesquisa e seleção por pasta;
- prevenção de colisões de nomes;
- modal responsivo com rodapé e botões sempre visíveis.

## Compatibilidade

O plugin usa apenas APIs do Obsidian e permanece com `isDesktopOnly: false`. Não usa Node.js nem Electron em tempo de execução.


## v1.5.1

- Corrige o destino de exportação de notas homônimas: o nome do `.txt` agora é determinado considerando todas as notas Markdown do vault, e não apenas a seleção atual.
- A mesma nota recebe o mesmo destino tanto na exportação individual quanto em lote, desde que o conjunto de notas do vault não tenha mudado.
- Colisões são comparadas de forma conservadora sem diferenciar maiúsculas/minúsculas, evitando conflito em filesystems case-insensitive.
- Sufixos gerados (`(2)`, `(3)` etc.) não ocupam um nome que seja o destino natural de outra nota.
- Nenhuma outra lógica de exportação, limpeza, embeds, i18n, acessibilidade ou formato de dados foi alterada.


## v1.5.0

- Interface internacionalizada: en, zh-CN, ja, ko, de, fr, es, pt-BR e ru, com fallback em inglês.
- Acessibilidade reforçada para VoiceOver/NVDA, foco visível, aria-labels, aria-live apenas para conclusões importantes e alvos de toque maiores no mobile.
- Modal principal reorganizado com os nomes “Exportação única”, “Copiar para transferência” e “Exportar em lotes” em pt-BR.
- Descrição principal menor, identificação discreta da nota ativa em roxo e botões alinhados verticalmente.
- Nenhum formato de dado salvo foi alterado por causa da internacionalização/acessibilidade.

## v1.6.3 — palette compacta e seleção direta no Explorador

- O ícone de exportação abre uma palette não modal com três botões: página atual, seleção em lote e cancelar seleção.
- O modo em lote permite clicar diretamente em notas Markdown no Explorador de Arquivos; os itens selecionados recebem contorno e check visual.
- O segundo botão inicia a seleção e, depois que há notas selecionadas, exporta o conjunto ao ser pressionado novamente.
- O terceiro botão cancela e limpa a seleção em lote sem exportar.
- A seleção é apenas temporária em memória e não altera nem persiste nada nas notas.
- A v1.5.1 aprovada permanece congelada; esta é uma nova versão de teste.


## v1.6.3 (teste)

- O botão de lote mantém exatamente o ícone de duas páginas quando o modo de seleção está ativo; apenas adiciona um check sobre a página da frente para indicar que um segundo clique confirma a exportação.


## v1.6.5 — revalidação durante o lote

- Corrige a race encontrada na auditoria da v1.6.4: o mapa de destinos não fica mais congelado no início de todo o lote.
- Cada nota é revalidada por identidade imediatamente antes e depois da leitura assíncrona.
- O destino determinístico é recalculado usando o estado atual do vault para cada item antes da escrita.
- Se path/identidade/destino mudar durante uma espera assíncrona, o plugin recalcula de forma limitada ou falha o item de forma segura.
- Um destino já reservado por outra nota no mesmo lote não pode ser reutilizado, evitando overwrite silencioso quando o conjunto de colisões muda durante a operação.
- Nenhuma mudança intencional em UI, CSS, embeds, limpeza Markdown, configurações ou formato persistido.


## v1.6.6 — cache do mapa de destinos durante o lote

- Corrige a regressão de performance encontrada na auditoria da v1.6.5 sem remover as proteções de identidade/destino.
- O mapa determinístico de destinos é construído uma vez e reutilizado enquanto o conjunto relevante de notas Markdown do vault permanecer estável.
- Criação de nota Markdown, rename/move de nota Markdown, rename de pasta e delete de nota/pasta invalidam o cache por uma geração em memória.
- Criação/modificação de `.txt`, criação de pasta de exportação e edições comuns no conteúdo das notas não invalidam o mapa.
- Se uma mutação relevante ocorrer durante um `await`, o item revalida identidade/path e reconstrói o mapa apenas quando necessário.
- Continua proibido reutilizar no mesmo lote um destino já reservado por outro `TFile`.
- Nenhuma mudança intencional em UI, CSS, embeds, limpeza Markdown, configurações ou formato persistido.
