# tiago7 Plugin Updater Plugin Obsidian

Atualizador fechado e conservador para um conjunto pequeno e explícito de plugins públicos de `tiagocoelho7`. A versão 1.1.0 autoriza somente o **tiago7 Plain Text Export Plugin Obsidian**.

## Modelo de segurança

- Não usa token, login, OAuth, telemetria ou analytics.
- Não faz nenhuma consulta de rede nem instala atualizações automaticamente, periodicamente ou ao iniciar o Obsidian; nessa etapa, lê somente o estado local.
- Toda verificação e toda instalação exigem cliques explícitos e separados.
- Não aceita repositórios, URLs ou IDs configurados pelo usuário ou recebidos da rede.
- O próprio updater não está na whitelist e possui um bloqueio adicional contra autoatualização.
- Usa `requestUrl`, Web Crypto e o adapter do vault, sem APIs Node.js ou Electron no runtime.
- Nenhum conteúdo, nome de nota, caminho do vault ou configuração pessoal é enviado pela rede.
- Faz download somente dos quatro assets esperados e mantém todos os bytes em memória até concluir as validações.
- Exige autenticação Ed25519 com uma chave pública SPKI fixada no código; o key-id é derivado em runtime do SHA-256 dessa chave.
- Verify e Update repetem a autenticação completa. Update usa somente o cache cru validado e não acessa a rede.
- Falta de suporte a Ed25519, assinatura inválida ou qualquer divergência causa falha fechada.

Uma release instalável precisa ser pública, não ser draft nem prerelease, ter `immutable === true` e conter exatamente `main.js`, `manifest.json`, `styles.css` e `release-signature.txt`. Cada plugin file precisa estar no estado `uploaded`, ter no máximo 5 MiB e corresponder ao digest SHA-256 lowercase publicado pelo GitHub. O arquivo de autenticação tem limite de 4096 bytes, também exige digest GitHub e nunca é instalado, copiado para backup ou restaurado.

`release-signature.txt` vincula estritamente host, owner, repositório, plugin ID, versão, tag e hashes dos três plugin files. A assinatura Ed25519 cobre os bytes remotos exatos das primeiras 12 linhas. O manifest precisa ter o ID autorizado, versão coerente com a tag e `isDesktopOnly: false`.

A chave pública SPKI fixada é `MCowBQYDK2VwAyEAnEKaOvQuKdbnfu+U7DubEqfLyUNJI3grxzlfYHUtrpc=`. Seu key-id não é uma autoridade separada: ele é sempre rederivado em runtime a partir do SHA-256 do DER SPKI.

Antes de substituir uma instalação, o updater salva os arquivos existentes em `<configDir>/plugins/.tiago7-plugin-updater-backups/`. `data.json` nunca é copiado, removido ou alterado. A última versão salva pode ser restaurada manualmente. Depois de instalar ou restaurar, reinicie o Obsidian para carregar os arquivos.

## Uso

Ative o plugin no Obsidian e use o comando **Verificar atualizações dos meus plugins** ou abra a aba de configurações do updater. Abrir as configurações só consulta arquivos locais. Clique em **Verificar atualização** (ou **Verificar todos**) para consultar o GitHub. Se a release passar por todas as verificações, clique separadamente em **Atualizar** ou **Instalar**.

## Adicionar outro plugin no futuro

Adicionar um plugin exige uma mudança deliberada no código: revise e inclua uma entrada literal em `AUTHORIZED_PLUGINS`, gere e audite uma nova versão deste updater e publique-a pelo processo normal. Não transforme a whitelist em configuração, não aceite dados remotos para ampliá-la e nunca inclua o ID `tiago7-plugin-updater-plugin-obsidian`.

Antes de publicar uma nova release de um plugin autorizado, ative **Release Immutability** no GitHub e anexe exatamente os quatro assets esperados com digests SHA-256 fornecidos pela API. A mudança deliberada de whitelist não substitui a assinatura obrigatória.

## Limitação residual de replay do protocolo v1

Se a apresentação do GitHub fosse comprometida, uma release antiga, corretamente assinada e ainda superior à versão instalada poderia ser reapresentada. Uma instalação limpa também pode aceitar uma release antiga corretamente assinada. Isso não permite fabricar bytes arbitrários sem a private key. Esta versão não implementa `minimumSignedVersion`.

## Compatibilidade

O manifesto declara `isDesktopOnly: false`. O runtime foi feito para macOS, Windows, Linux, iPhone e iPad por meio das APIs públicas do Obsidian compatíveis com mobile.
