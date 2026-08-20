# tiago7 Plugin Updater Plugin Obsidian

Atualizador fechado e conservador para um conjunto pequeno e explícito de plugins públicos de `tiagocoelho7`. A versão 1.0.0 autoriza somente o **tiago7 Plain Text Export Plugin Obsidian**.

## Modelo de segurança

- Não usa token, login, OAuth, telemetria ou analytics.
- Não verifica nem instala atualizações automaticamente, periodicamente ou ao iniciar o Obsidian.
- Toda verificação e toda instalação exigem cliques explícitos e separados.
- Não aceita repositórios, URLs ou IDs configurados pelo usuário ou recebidos da rede.
- O próprio updater não está na whitelist e possui um bloqueio adicional contra autoatualização.
- Usa `requestUrl`, Web Crypto e o adapter do vault, sem APIs Node.js ou Electron no runtime.
- Nenhum conteúdo, nome de nota, caminho do vault ou configuração pessoal é enviado pela rede.
- Faz download somente dos três assets esperados e mantém todos os bytes em memória até concluir as validações.

Uma release instalável precisa ser pública, não ser draft nem prerelease, ter `immutable === true` e conter exatamente `main.js`, `manifest.json` e `styles.css`. Cada asset precisa fornecer um digest `sha256:...`; o updater calcula SHA-256 localmente e cancela a operação inteira se houver divergência. O manifesto também precisa ter o ID autorizado, versão coerente com a tag e `isDesktopOnly: false`.

Antes de substituir uma instalação, o updater salva os arquivos existentes em `<configDir>/plugins/.tiago7-plugin-updater-backups/`. `data.json` nunca é copiado, removido ou alterado. A última versão salva pode ser restaurada manualmente. Depois de instalar ou restaurar, reinicie o Obsidian para carregar os arquivos.

## Uso

Ative o plugin no Obsidian e use o comando **Verificar atualizações dos meus plugins** ou abra a aba de configurações do updater. Abrir as configurações só consulta arquivos locais. Clique em **Verificar atualização** (ou **Verificar todos**) para consultar o GitHub. Se a release passar por todas as verificações, clique separadamente em **Atualizar** ou **Instalar**.

## Adicionar outro plugin no futuro

Adicionar um plugin exige uma mudança deliberada no código: revise e inclua uma entrada literal em `AUTHORIZED_PLUGINS`, gere e audite uma nova versão deste updater e publique-a pelo processo normal. Não transforme a whitelist em configuração, não aceite dados remotos para ampliá-la e nunca inclua o ID `tiago7-plugin-updater-plugin-obsidian`.

Antes de publicar uma nova release de um plugin autorizado, ative **Release Immutability** no GitHub e anexe exatamente os três assets esperados com digests SHA-256 fornecidos pela API.

## Compatibilidade

O manifesto declara `isDesktopOnly: false`. O runtime foi feito para macOS, Windows, Linux, iPhone e iPad por meio das APIs públicas do Obsidian compatíveis com mobile.
